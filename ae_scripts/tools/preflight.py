#!/usr/bin/env python3
"""JSX 发送前预检：把编译错误挡在 AE 之外。

用法: python3 preflight.py <script.jsx>     通过返回 0，失败返回 1 并打印问题

为什么必须有：AE 的 app.beginSuppressDialogs() 只挡运行时对话框，
**挡不住编译错误**。一个语法错误会在用户屏幕上弹出模态框并阻塞 AE，
从脚本侧看只是"无输出"，很难定位。（2026-07-30 实测踩过：变量名用了 native。）

两道检查：
1. node --check 语法解析
2. ES3 保留字扫描 —— ExtendScript 是 ES3 时代语言，一批在现代 JS 合法的词
   （native/class/int/char/final...）在它这里是保留字，node 不会报错但 AE 会拒。
"""
import re
import subprocess
import sys

# ES3 保留字 + 未来保留字：现代 JS 多数允许，ExtendScript 拒绝
ES3_RESERVED = {
    "abstract", "boolean", "byte", "char", "class", "const", "debugger", "double",
    "enum", "export", "extends", "final", "float", "goto", "implements", "import",
    "int", "interface", "long", "native", "package", "private", "protected",
    "public", "short", "static", "super", "synchronized", "throws", "transient",
    "volatile",
}


def _strip_code(line):
    """先去字符串字面量，再去注释 —— 顺序不能反。

    2026-08-11 实测的坑：生成器写出的 JSX 会把整段 AE 表达式作为字符串塞进代码，
    而表达式本身带 `//` 注释。先去注释的话，注释正则会把字符串的结束引号一起吃掉，
    后面的字符串正则就匹配不上，字符串里的 thisComp / wiggle 全部暴露成误报。
    """
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', line)
    code = re.sub(r"'(?:[^'\\]|\\.)*'", "''", code)
    code = re.sub(r"//.*$", "", code)
    return code


def check_syntax(path):
    # node 按扩展名判断模块类型，.jsx 会被拒；拷成 .js 再检查
    import shutil, tempfile, os
    tmp = os.path.join(tempfile.gettempdir(), "_preflight_check.js")
    shutil.copyfile(path, tmp)
    try:
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    finally:
        try: os.remove(tmp)
        except OSError: pass
    if r.returncode != 0:
        lines = [l for l in (r.stderr or "").strip().split("\n") if l.strip()]
        # 只保留有信息量的那几行（跳过 node 自己的堆栈）
        keep = [l for l in lines if "SyntaxError" in l or "^" in l or tmp in l][:4]
        return ["语法错误: " + l.strip() for l in (keep or lines[:3])]
    return []


def check_reserved(path):
    src = open(path, encoding="utf-8").read()
    problems = []
    # 只查"被当作标识符使用"的位置：var X / function X / X = / catch(X) / 形参
    patterns = [
        (r"\bvar\s+([A-Za-z_$][\w$]*)", "var"),
        (r"\bfunction\s+([A-Za-z_$][\w$]*)", "function"),
        (r"\bcatch\s*\(\s*([A-Za-z_$][\w$]*)", "catch"),
    ]
    for line_no, line in enumerate(src.split("\n"), 1):
        code = _strip_code(line)
        for pat, kind in patterns:
            for m in re.finditer(pat, code):
                name = m.group(1)
                if name in ES3_RESERVED:
                    problems.append(
                        "第 %d 行: %s %s  ← ES3 保留字，ExtendScript 会拒绝编译（改个名即可）"
                        % (line_no, kind, name)
                    )
    return problems


# ExtendScript(ES3) 没有的 ES5+ 特性：现代 JS 能跑，AE 里会 undefined 或语法错
# 表达式语言专属函数：JSX 里调用会返回 Error 对象，语法合法但运行时炸
# （2026-07-30 实测：layer.toComp() 在 ExtendScript 里不存在）
EXPR_ONLY = [
    (r"\.\s*toComp\s*\(", "layer.toComp()", None),
    (r"\.\s*fromComp\s*\(", "layer.fromComp()", None),
    (r"\.\s*toWorld\s*\(", "layer.toWorld()", None),
    (r"\.\s*fromWorld\s*\(", "layer.fromWorld()", None),
    (r"\.\s*toCompVec\s*\(", "layer.toCompVec()", None),
    (r"\bthisComp\b", "thisComp", None),
    (r"\bthisLayer\b", "thisLayer", None),
    (r"\bthisProperty\b", "thisProperty", None),
    (r"\bwiggle\s*\(", "wiggle()", "wiggle"),
    (r"\bseedRandom\s*\(", "seedRandom()", "seedRandom"),
    (r"\blinear\s*\(", "linear()", "linear"),
    (r"\bease\s*\(", "ease()", "ease"),
    (r"\beaseIn\s*\(", "easeIn()", "easeIn"),
    (r"\beaseOut\s*\(", "easeOut()", "easeOut"),
    (r"\blookAt\s*\(", "lookAt()", "lookAt"),
    (r"\bdegreesToRadians\s*\(", "degreesToRadians()", "degreesToRadians"),
    # 2026-07-30 实测：prop.key(n).time 是表达式写法，ExtendScript 里要用 keyTime(n)
    (r"\.\s*key\s*\(\s*[^)]*\)\s*\.\s*(?:time|value|index)", "prop.key(n).time/.value（ExtendScript 用 keyTime(n)/keyValue(n)）", None),
    (r"\bnearestKey\s*\(", "nearestKey()", "nearestKey"),
    (r"\bvalueAtTime\s*\(\s*\w+\s*\)\s*(?!,)", None, None),  # 占位，不报错
]
EXPR_ONLY = [p for p in EXPR_ONLY if p[1] is not None]


def check_expr_only(path):
    """检测表达式专属函数被用在 JSX 里。字符串字面量内的不算（那是要写进表达式的）。"""
    src = open(path, encoding="utf-8").read()
    local_functions = set(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", src))
    out = []
    for line_no, line in enumerate(src.split("\n"), 1):
        code = _strip_code(line)
        # 去掉字符串字面量：写进 .expression = "..." 的内容是合法的
        code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', code)
        code = re.sub(r"'(?:[^'\\]|\\.)*'", "''", code)
        for pat, label, local_name in EXPR_ONLY:
            if local_name and local_name in local_functions:
                continue
            if re.search(pat, code):
                out.append("第 %d 行: %s ← 这是表达式语言专属，ExtendScript 里不存在"
                           "（会返回 Error 对象，运行时才报错）" % (line_no, label))
                break
    return out


ES5_PATTERNS = [
    (r"\.forEach\s*\(", "Array.forEach"),
    (r"\.map\s*\(", "Array.map"),
    (r"\.filter\s*\(", "Array.filter"),
    (r"\.reduce\s*\(", "Array.reduce"),
    (r"\bJSON\s*\.\s*(?:parse|stringify)", "JSON 对象"),
    (r"\.trim\s*\(\s*\)", "String.trim"),
    (r"\bObject\s*\.\s*keys", "Object.keys"),
    (r"=>", "箭头函数"),
    (r"\b(?:let|const)\s+\w", "let/const"),
]


def check_es5(path):
    """两遍扫描：先找出被赋值为数组字面量的变量，再查这些变量上的 .indexOf。
    （String.indexOf 在 ES3 是有的，不能一刀切报错。）"""
    src = open(path, encoding="utf-8").read()
    lines = src.split("\n")
    array_vars = set(re.findall(r"\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\[", src))
    # 若文件对 JSON 做了存在性防御（typeof JSON !== "undefined"）并备了降级路径，
    # 说明作者清楚 ExtendScript 可能没有 JSON，不该报错。（2026-07-30 误报过桥接面板）
    json_guarded = "typeof JSON" in src
    out = []
    for line_no, line in enumerate(lines, 1):
        code = _strip_code(line)
        for v in array_vars:
            if re.search(r"\b%s\s*\.indexOf\s*\(" % re.escape(v), code):
                out.append("第 %d 行: %s.indexOf() ← %s 是数组，ExtendScript 数组没有 indexOf（改用 join 后字符串查找或手写循环）" % (line_no, v, v))
        if re.search(r"\]\s*\.indexOf\s*\(", code):
            out.append("第 %d 行: 数组字面量 .indexOf() ← ES3 不支持" % line_no)
        for pat, label in ES5_PATTERNS:
            if label == "JSON 对象" and json_guarded:
                continue
            if re.search(pat, code):
                out.append("第 %d 行: 用到 %s ← ExtendScript(ES3) 不支持" % (line_no, label))
                break
    return out


def check_error_handler(path):
    """catch 块里访问 err.line —— 2026-07-30 查明的高频事故源。

    ExtendScript 里 err.line 不保证存在；取不到时返回 Error 对象，
    而 Error 对象 truthy，`err.line || "?"` 会把它拼进字符串 → 整脚本中止。
    后果特别隐蔽：真正的错误信息被吞掉，报错行号指向 catch 那一行。
    """
    src = open(path, encoding="utf-8").read()
    out = []
    for line_no, line in enumerate(src.split("\n"), 1):
        code = _strip_code(line)
        if re.search(r"\b\w*(?:err|e|ex)\w*\s*\.\s*line\b", code):
            out.append(
                "第 %d 行: catch 里访问 err.line ← ExtendScript 取不到时返回 Error 对象，"
                "拼进字符串会让整脚本中止并吞掉真实错误（改用 String(err)）" % line_no
            )
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    p = sys.argv[1]
    issues = (check_syntax(p) + check_reserved(p) + check_es5(p)
              + check_expr_only(p) + check_error_handler(p))
    if issues:
        print("✗ 预检未通过，未发送到 AE：")
        for i in issues:
            print("   " + i)
        sys.exit(1)
    print("✓ 预检通过")
