# 书库 Release 存储

迁移完成后，小说二进制文件不再进入 Git 仓库或 GitHub Pages。书库在本地开发时
优先扫描本地源目录；GitHub Actions 的干净检出中没有这些文件，因此会自动改读
`src/data/library.generated.json`，下载按钮则指向 GitHub Release。

## 首次准备

在 Windows PowerShell 中运行：

```powershell
pnpm.cmd library:prepare
```

该命令会完成以下工作：

1. 扫描 `public/books/` 中全部 TXT 和 EPUB。
2. 计算每个文件的 SHA-256、大小和稳定资源名。
3. 更新 `src/data/library.generated.json`。
4. 在被 Git 忽略的 `.library-release/assets/` 中建立上传暂存文件。
5. 生成 `.library-release/upload.ps1`。

暂存文件优先使用硬链接，所以一般不会重复占用磁盘空间。文件系统不支持硬链接时
才会复制文件。

## 上传资源

先安装并登录 GitHub CLI，然后运行生成的脚本：

```powershell
gh auth login
powershell -ExecutionPolicy Bypass -File .library-release/upload.ps1
```

脚本会在 `Tosanfers/Tosanfers.github.io` 创建或更新 `library-v1` Release。相同
资源名会被新文件替换。

上传完成后运行迁移收尾命令：

```powershell
pnpm.cmd library:finalize
```

该命令会先逐个验证本地 SHA-256 和 Release 下载地址。只有清单中的远程资源全部可以
访问时，才会把二进制文件移动到被 Git 忽略的 `.library-source/`。此时工作区会显示
原 `public/books/` 二进制文件已删除；检查结果后提交这些删除和生成的清单，Pages
部署包才会真正移除小说文件。

## 后续增加或修改书籍

迁移完成后，把新增文件放到 `.library-source/` 中对应的目录，然后重新运行：

```powershell
pnpm.cmd library:prepare
powershell -ExecutionPolicy Bypass -File .library-release/upload.ps1
```

最后提交更新后的清单。`.library-source/`、`public/books/**/*.epub`、
`public/books/**/*.txt` 和 `.library-release/` 已加入 `.gitignore`。封面图片不受
这些规则影响，仍可放在 `public/books/covers/`。

如需更换仓库或 Release 标签，可以传入参数：

```powershell
node tools/prepare-library-release.mjs `
  --repository Tosanfers/Tosanfers.github.io `
  --tag library-v2
```
