# Motion Agent 本机分析工具安装包

这个安装包用于安装视频和音频分析所需的本机工具。它和 AE AI Bridge 是两套东西：

- AE AI Bridge：让 Agent 控制 After Effects。
- 本机分析工具：让 Agent 读取视频、抽帧、拼图、做像素差、读取音频、分析节奏。

## 包含什么

安装脚本会检查并安装：

- `ffmpeg`
- `ffprobe`
- Python 虚拟环境 `.venv-motion-analysis`
- Python 包：`numpy`、`pillow`、`opencv-python`、`librosa`、`soundfile`、`scipy`

## 安装

1. 解压 `Motion-Agent-Analysis-Tools-macOS.zip`。
2. 打开解压后的文件夹。
3. 双击 `install.command`。
4. 如果 macOS 提示无法打开，请右键点击 `install.command`，选择“打开”。

如果电脑上没有 Homebrew，安装脚本会提示先安装 Homebrew。Homebrew 用来安装 `ffmpeg`。

## 验证

安装完成后，在安装包目录运行：

```bash
./verify.command
```

全部通过时会看到：

```text
Analysis toolchain OK
```

## 使用方式

安装完成后，Motion Agent 可以使用这些工具完成：

- 读取视频时长、帧率、分辨率
- 从视频中按时间点抽帧
- 拼接 contact sheet
- 做画面像素差和简单运动测量
- 提取音轨
- 分析音频能量峰值、节拍和卡点
- 自动适配音乐转场：保留原音频前半段，替换指定时间段，并把新音乐强拍对齐到落版时间

## 音频转场自动适配

如果视频前半段音乐已经满意，只需要替换后半段，可以使用：

```bash
./audio-transition-fit.command \
  --base /path/to/original-video-or-audio.mp4 \
  --replacement /path/to/new-music-from-suno.mp3 \
  --replace-start 17.8 \
  --replace-end 27.63 \
  --end-at-replace-end \
  --output /path/to/motion-agent-audio-fit.wav
```

它会：

1. 保留 `0s` 到 `17.8s` 的原音频。
2. 从新音乐中自动寻找适合落在 `27.63s` 的强拍。
3. 截取约 `9.83s` 的替换段。
4. 在接点处做短交叉淡化，降低突兀感。
5. 输出一条可以直接导入 After Effects 的音频。

如果自动找强拍不准，可以手动指定新音乐从哪里开始截：

```bash
./audio-transition-fit.command \
  --base /path/to/original-video-or-audio.mp4 \
  --replacement /path/to/new-music-from-suno.mp3 \
  --replace-start 17.8 \
  --replace-end 27.63 \
  --replacement-start 4.2 \
  --end-at-replace-end \
  --output /path/to/motion-agent-audio-fit.wav
```

这些工具只在本机运行，不是 AE 插件。
