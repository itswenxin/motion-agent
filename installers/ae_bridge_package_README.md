# Motion Agent AE Bridge 安装包

这个安装包用于把 Motion Agent 面板（`Motion Agent.jsx`）安装到 Adobe After Effects 的 ScriptUI Panels 目录，并连接到统一的本机命令队列。

## 安装

1. 解压 `Motion-Agent-AE-Bridge-macOS.zip`。
2. 双击 `install.command`。
3. 如果 macOS 提示无法打开，请右键点击 `install.command`，选择“打开”。
4. 安装完成后重启 After Effects，或关闭并重新打开 AE 面板。
5. 在 AE 菜单中打开 `Window > Motion Agent.jsx`。

## AE 内第一次连接

1. 打开 `Window > Motion Agent.jsx`。
2. 点击 `Check AE Permission`。
3. 如果 AE 打开设置页，请启用：
   `Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network`
4. 回到面板，点击 `Codex Desktop`。
5. 面板状态显示 `connected` 后，桥梁已经可用。

## 命令行验证

在解压后的安装包目录运行：

```bash
node send-command.js ping
```

成功时会看到类似：

```json
{
  "ok": true,
  "data": {
    "pong": true
  }
}
```

如果超时，请确认 AE 已打开、`Motion Agent.jsx` 面板已打开，并且已经点击 `Codex Desktop`。

## Bridge Doctor

如果面板显示 connected 但命令不执行，或本机出现多套 `runtime/` 导致队列不一致，可以在解压后的安装包目录运行：

```bash
./repair-runtime-link.sh
```

它会把本包内的 `runtime/` 指向统一 runtime，并运行一次 `doctor` 检查：清理旧 pending、检查队列、确认结果/预览缓存状态。
