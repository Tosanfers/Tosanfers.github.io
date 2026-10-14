# 小说文件

将允许公开下载的 `.txt` 或 `.epub` 文件放在此目录或任意子目录中。构建时会
递归发现这些文件，并自动生成书库列表和详情页；不需要逐本登记。
子目录会同时生成书库中的文件夹分类和详情页面包屑。移动文件后，分类会在
下一次构建时自动更新。

自动推断的信息包括书名、部分文件名中的作者、顶层目录分类、格式、文件大小、
加入日期和完结状态。需要修正资料时，在 `src/data/books.ts` 的
`bookOverrides` 中按公开文件路径添加覆盖项：

```ts
{
	file: "/books/轻小说epub/小说名称.epub",
	title: "小说名称",
	author: "作者名",
	series: "系列名称",
	volume: 1,
	description: "简介",
	personalReview: "这里填写本人评价，可以使用多行文字。",
	cover: "/books/covers/novel.webp",
	category: "轻小说",
	tags: ["奇幻"],
	status: "completed",
	readingStatus: "reading",
	rating: 4.5,
	added: "2026-10-13",
}
```

其中只有 `file` 必填。分类目录下包含多本书的子目录会自动成为系列，文件名末尾的
`.01`、` 1` 或 `第1卷` 会自动成为卷号；系列内按卷号升序排列，未识别卷号的特别篇
排在数字卷之后。可用 `series` 和 `volume` 修正结果，或设置 `series: false` 取消自动
分组。`added` 使用 `YYYY-MM-DD`；评分范围为 0–5；要从页面隐藏文件可设置
`hidden: true`。扩展名必须是 `.txt` 或 `.epub`，误写为 `.epbu` 会在构建时报出明确
错误。未填写 `added` 时会使用文件修改日期；如需让部署后的“最近添加”顺序保持固定，
请显式填写该字段。

## 网络书籍

来自网络的 TXT/EPUB 直链放在 `src/data/books.ts` 的 `networkBooks` 中：

```ts
{
	url: "https://example.com/books/novel.epub",
	title: "网络小说名称",
	added: "2026-10-13",
	author: "作者名",
	series: "系列名称",
	volume: 1,
	category: "轻小说",
	tags: ["网络资源"],
}
```

`url`、`title` 和 `added` 必填。URL 必须使用 HTTPS；路径以 `.txt` 或 `.epub`
结尾时会自动识别格式，否则还需填写 `format: "TXT"` 或 `format: "EPUB"`。
`fileSize` 可选，单位为字节。封面仍使用本项目中的 `/books/...` 路径，避免依赖外站
图片。构建过程只校验配置，不会请求或下载远程资源；链接是否可用由资源提供方负责。

TXT 和 EPUB 已配置为通过 GitHub Release 分发，不再进入新的 Pages 部署。首次迁移
和后续更新步骤见 `docs/library-release.md`。Release 下载地址仍是公开地址，因此只应
上传你有权公开传播的内容。
