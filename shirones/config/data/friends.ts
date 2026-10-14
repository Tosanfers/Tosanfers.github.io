/**
 * 友情链接数据配置（结构与 Mizuki 同款，便于互相迁移）。
 * 用于管理友情链接页面的数据：src/pages/friends.astro → organisms/FriendSection。
 *
 * 添加友链：在 friendsData 中追加一项即可，页面 / 筛选标签自动生成。
 * tags 会聚合为页面顶部的筛选 chip（OR 命中：选中多个标签时命中任一即显示）。
 */
export interface FriendItem {
  id: number;
  title: string;
  imgurl: string;
  desc: string;
  siteurl: string;
  tags: string[];
}

// 友情链接数据
export const friendsData: FriendItem[] = [
  {
    id: 1,
    title: "Mizuki",
    imgurl: "https://avatars.githubusercontent.com/u/225602409?v=4&s=640",
    desc: "Another Fuwari-based blog theme with docs",
    siteurl: "https://mizuki.mysqil.com",
    tags: ["Blog", "Theme"],
  },
  {
    id: 2,
    title: "Astro",
    imgurl: "https://avatars.githubusercontent.com/u/44914786?v=4&s=640",
    desc: "The web framework for content-driven websites",
    siteurl: "https://astro.build",
    tags: ["Framework"],
  },
  {
    id: 3,
    title: "Material 3",
    imgurl: "https://avatars.githubusercontent.com/u/19478152?v=4&s=640",
    desc: "Material Design 3 — the next generation of Material Design",
    siteurl: "https://m3.material.io",
    tags: ["Design"],
  },
  {
    id: 4,
    title: "Z-Library",
    imgurl: "https://zh.z-library.sk/img/logo.zlibrary.svg",
    desc: "The world's largest open-access digital library",
    siteurl: "https://zh.z-library.sk/",
    tags: ["books", "library"],
  },
  {
    id: 5,
    title: "赔钱机场",
    imgurl: "https://avatars.githubusercontent.com/u/19478152?v=4&s=640",
    desc: "19.9/1000GB,你值得拥有",
    siteurl: "https://赔钱.com",
    tags: ["机场"],
  },
  {
    id: 6,
    title: "洛琪希图书馆",
    imgurl:
      "https://roxylib-1258123719.cos.ap-shanghai.myqcloud.com/img/roxylib.ico",
    desc: "无职转生收录站",
    siteurl: "https://pan.roxylib.com/",
    tags: ["books", "library"],
  },
  {
    id: 7,
    title: "百合会",
    imgurl: "https://www.yamibo.com/img/logo.png",
    desc: "啊，胜利者的早餐",
    siteurl: "https://www.yamibo.com/site/novel",
    tags: ["books", "library"],
  },
  {
    id: 8,
    title: "推荐喵",
    imgurl: "",
    desc: "群友的分享网站",
    siteurl: "https://book.彼岸-烛羽星弦.中国/",
    tags: ["books", "library"],
  },
  {
    id: 9,
    title: "磁力猫",
    imgurl: "",
    desc: "磁力搜索引擎",
    siteurl: "https://clm20240914.小花猫.com/",
    tags: ["download", "magnet"],
  },
  {
    id: 10,
    title: "mouse-sensitivity",
    imgurl:
      "https://www.mouse-sensitivity.com/uploads/monthly_2025_03/main-logo-47x265-dark_b73e6c.webp",
    desc: "射击游戏鼠标灵敏度计算器",
    siteurl: "https://www.mouse-sensitivity.com/",
    tags: ["tools", "gaming"],
  },
  {
    id: 11,
    title: "PlayZip",
    imgurl: "",
    desc: "游戏下载站，提供各种游戏资源和工具",
    siteurl: "https://playzip.com/",
    tags: ["games", "download"],
  },
];

// 获取所有友情链接数据（稳定顺序，测试可复现）
export function getFriendsList(): FriendItem[] {
  return friendsData;
}

// 获取随机排序的友情链接数据（避免固定排序，按需使用）
export function getShuffledFriendsList(): FriendItem[] {
  const shuffled = [...friendsData];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
