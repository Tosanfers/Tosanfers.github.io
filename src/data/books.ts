export type BookFormat = "TXT" | "EPUB";
export type BookStatus = "ongoing" | "completed" | "unknown";
export type ReadingStatus = "unread" | "reading" | "finished";

/** 手工资料覆盖项。file 是唯一必填字段，其余信息可由文件名和目录推断。 */
export interface BookDefinition {
	file: string;
	id?: string;
	title?: string;
	author?: string;
	description?: string;
	personalReview?: string;
	cover?: string;
	format?: BookFormat;
	category?: string;
	tags?: string[];
	status?: BookStatus;
	readingStatus?: ReadingStatus;
	rating?: number;
	added?: string;
	hidden?: boolean;
}

/** 页面实际消费的、经过文件扫描与校验的完整数据。 */
export interface Book {
	id: string;
	title: string;
	author: string;
	description: string;
	personalReview: string;
	coverUrl?: string;
	fileUrl: string;
	detailUrl: string;
	folderPath: string;
	folderSegments: string[];
	format: BookFormat;
	category: string;
	tags: string[];
	status: BookStatus;
	readingStatus: ReadingStatus;
	rating?: number;
	added: string;
	fileSize: number;
	fileSizeLabel: string;
}

export interface LibraryStats {
	total: number;
	finished: number;
	reading: number;
	epub: number;
}

export interface LibraryFolder {
	path: string;
	name: string;
	parentPath: string;
	directCount: number;
	totalCount: number;
}

export interface LibraryManifestEntry {
	file: string;
	assetName: string;
	downloadUrl: string;
	fileSize: number;
	added: string;
	sha256: string;
}

export interface LibraryManifest {
	version: 1;
	repository: string;
	tag: string;
	books: LibraryManifestEntry[];
}

/** 书库页面文案集中在数据层，页面和组件不写死可见文案。 */
export const libraryMeta = {
	title: "小说书库",
	description: "收藏与整理本地 TXT、EPUB 小说",
	countSuffix: "本小说",
	empty: "书库里还没有小说。",
	noResults: "没有找到符合条件的小说。",
	download: "下载",
	details: "查看详情",
	back: "返回书库",
	noCover: "暂无封面",
	coverSuffix: "封面",
	metadataLabel: "书籍信息",
	personalReview: "本人评价",
	emptyPersonalReview: "暂未填写评价。",
	search: "搜索书名、作者、简介或标签",
	clearSearch: "清除搜索",
	category: "分类",
	format: "格式",
	readingStatus: "阅读状态",
	allCategories: "全部分类",
	allFormats: "全部格式",
	allReadingStatuses: "全部阅读状态",
	folderNavigation: "文件夹分类",
	allBooks: "全部书籍",
	parentFolder: "返回上级",
	rootFolder: "根目录",
	sort: "排序",
	sortAddedDesc: "最近添加",
	sortTitleAsc: "书名 A–Z",
	sortRatingDesc: "评分最高",
	statusLabels: {
		ongoing: "连载中",
		completed: "已完结",
		unknown: "状态未知",
	},
	readingStatusLabels: {
		unread: "未读",
		reading: "在读",
		finished: "已读",
	},
	stats: {
		total: "全部藏书",
		finished: "已经读完",
		reading: "正在阅读",
		epub: "EPUB 文件",
	},
	added: "加入日期",
	fileSize: "文件大小",
	author: "作者",
	rating: "个人评分",
	uncategorized: "未分类",
	unknownAuthor: "未知作者",
	localFileDescription: "本地 {format} 文件：{title}",
} as const;

export type LibraryCopy = typeof libraryMeta;

/**
 * public/books 下的 TXT/EPUB 会自动进入书库。只有需要修正自动推断资料时，
 * 才在这里按公开文件路径添加覆盖项。
 */
export const bookOverrides: readonly BookDefinition[] = [];
