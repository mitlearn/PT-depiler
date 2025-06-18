import { 
  ISiteMetadata,
  ITorrent,
  ITorrentTag
} from "../types";
import AvistazTracker, { SchemaMetadata, IAvzTRawTorrent } from "../schemas/AvistazTracker.ts";

const categoryMap: Record<number, string> = {
  1: "Video Clips",
  2: "Video Pack",
  3: "Siterip Pack",
  4: "Pornstar Pack",
  5: "DVD",
  6: "BluRay",
  7: "Photo Pack",
  8: "Books & Magazines",
};

const resolutionMap: Record<number, string> = {
  1: "240p",
  2: "360p",
  3: "480p",
  4: "720p",
  5: "1080p",
  6: "2160p",
  7: "4320p",
  8: "VR 180°",
  9: "VR 360°",
};

const discountMap: Record<number, string> = {
  1: "Free-Download",
  2: "Half-Download",
  3: "Double Upload",
}

export const siteMetadata: ISiteMetadata = {
  ...SchemaMetadata,

  version: 1,
  id: "exoticaz",
  name: "ExoticaZ",
  aka: ["Exo"],
  description: "A porn-conten tracker of AvistaZ Network",
  tags: ["成人"],
  timezoneOffset: "+0100",

  type: "private",
  schema: "AvistazTracker",

  urls: ["uggcf://rkbgvpnm.gb/"],
  formerHosts: ["https://torrents.yourexotic.com/"],

  collaborator: [""],

  category: [
  	{
      name: "分类",
      key: "category",
      keyPath: "params",
      options: Object.entries(categoryMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "分辨率",
      key: "res",
      keyPath: "params",
      options: Object.entries(resolutionMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "促销",
      key: "discount",
      keyPath: "params",
      options: Object.entries(discountMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "类型",
      key: "type",
      keyPath: "params",
      options: [
        { name: "Popular", value: "popular" },
        { name: "Asian", value: "asian" },
        { name: "Non-asian", value: "non_asian" },
        { name: "Softcore", value: "softcore" },
        { name: "Uncensored", value: "uncensored" },
        { name: "Censored", value: "censored" },
        { name: "Transexual", value: "transexual" },
      ],
      cross: { mode: "append", key: "" },
    },
  ],

  search: {
    ...SchemaMetadata.search!,
    advanceKeywordParams: {
      imdb: { enabled: false },
      tvdb: { enabled: false },
      tmdb: { enabled: false },
    },
    selectors: {
      ...SchemaMetadata.search!.selectors!,
    },
  },

    searchEntry: {
      area_all: { name: "成人", enabled: false },
    },

  levelRequirements: [
    {
      id: 1,
      name: "Leech",
      privilege: "Can download 1 torrent a day. Limited to download torrents uploaded 1 week ago. Cannot upload.",
    },
    {
      id: 2,
      name: "Newbie",
      privilege: "Can download 5 torrents a day. Cannot upload. Cannot use RSS.",
    },
    {
      id: 3,
      name: "Member",
      alternative: [{ ratio: 1 }, { interval: "P1W" }],
      privilege: "Can download 100 torrents a day. Can upload. Can use RSS (must enable it in My Account settings).",
    },
    {
      id: 100,
      name: "V.I.P.",
      groupType: "vip",
      privilege: "Can download 200 torrents a day. Can upload.",
    },
    // Staff Classes
    {
      id: 200,
      name: "Uploader",
      groupType: "manager",
      privilege: "Can upload.",
    },
    {
      id: 201,
      name: "Editor",
      groupType: "manager",
      privilege: "Can upload.",
    },
    { id: 205, name: "Moderator", groupType: "manager" },
    { id: 205, name: "Admin", groupType: "manager" },
    { id: 205, name: "Super Admin", groupType: "manager" },
  ],
};

export interface IExoRawTorrent extends IAvzTRawTorrent {
  data: {
  	asian: boolean;
    softcore: boolean;
    censored: boolean;
    gay: boolean;
    transexual: boolean;
    studios: string[];
    performers: string[];
  }
}

export default class Exoticaz extends AvistazTracker {

  /*
  public override async getUserInfoResult(lastUserInfo: Partial<IUserInfo> = {}): Promise<IUserInfo> {
    let flushUserInfo: IUserInfo = {
      status: EResultParseStatus.unknownError,
      updateAt: +new Date(),
      site: this.metadata.id,
    };

    if (!this.allowQueryUserInfo) {
      flushUserInfo.status = EResultParseStatus.passParse;
      return flushUserInfo;
    }

    try {
      
      // 获取主页中的用户基础信息
      const baseInfo = await this.getUserBaseInfoFromSite();
      flushUserInfo = { ...flushUserInfo, ...baseInfo };

      const username = this.userConfig.inputSetting?.username ?? "";
      if (username) {
        const extendInfo = await this.getUserExtendInfoFromProfile(username);
        flushUserInfo = { ...flushUserInfo, ...extendInfo };
      }
      flushUserInfo.id = username;
      flushUserInfo.name = baseInfo.name || username;

      if (this.metadata.levelRequirements && flushUserInfo.levelName && typeof flushUserInfo.levelId === "undefined") {
        flushUserInfo.levelId = this.guessUserLevelId(flushUserInfo as IUserInfo);
      }
      
      // 获取主页中的用户基础信息
      const tokenInfo = await this.getValidToken();
      flushUserInfo = { ...flushUserInfo, ...tokenInfo };
    
      flushUserInfo.status = EResultParseStatus.success;
    } catch (error) {
      flushUserInfo.status = EResultParseStatus.parseError;
    }

    return flushUserInfo;
  }

  protected async getUserBaseInfoFromSite(): Promise<Partial<IUserInfo>> {
    const { data: dataDocument } = await this.request<Document>({
      url: "/",
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.process?.selectors!,
      ["name", "uploaded", "downloaded", "ratio", "levelName", "bonus"]
    ) as Partial<IUserInfo>;
  }

  protected async getUserExtendInfoFromProfile(username: string): Promise<Partial<IUserInfo>> {
    const { data: dataDocument } = await this.request<Document>({
      url: `/profile/${username}`,
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.process?.selectors!,
      ["joinTime", "uploads", "snatches", "hnrUnsatisfied"]
    ) as Partial<IUserInfo>;
  }
  */
  private userSettings: { username: string; password: string; pid: string };

  constructor(userSettings: { username: string; password: string; pid: string }) {
    super();
    this.site = "example-site";
    this.userSettings = userSettings;
  }

  public async storeToken(site: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
    const userList: any[] = Array.isArray(metadataStore?.lastUserInfo) ? metadataStore.lastUserInfo : [];

    const index = userList.findIndex(
      u => u.site === site && u.username === this.userSettings.username
    );
    const userInfo = index !== -1 ? userList[index] : {};

    if (!userInfo.authToken || !userInfo.authExpiryAt || now >= userInfo.authExpiryAt) {
      const { username, password, pid } = this.userSettings;
      const { token, expiryAt } = await this.getValidToken(username, password, pid);

      const updatedInfo = {
        site,
        username,
        authToken: token,
        authExpiryAt: expiryAt,
      };

      if (index !== -1) {
        userList[index] = updatedInfo;
      } else {
        userList.push(updatedInfo);
      }

      await sendMessage("setExtStorage", {
        key: "metadata",
        value: { ...metadataStore, lastUserInfo: userList }
      });
    }
  }

  public async getTokenForSite(site: string): Promise<string | undefined> {
    const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
    const userList: any[] = Array.isArray(metadataStore?.lastUserInfo) ? metadataStore.lastUserInfo : [];
    const userInfo = userList.find(
      u => u.site === site && u.username === this.userSettings.username
    );
    return userInfo?.authToken;
  }
} 

  protected override parseTorrentRowForTags(
    torrent: Partial<ITorrent>,
    row: IExoRawTorrent,
  ): Partial<ITorrent> {
  	const basegroupTorrent = await super.parseTorrentRowForTags(torrent, row)

    // 生成副标题（演员名与标签）
    const tagsArray = Array.isArray(row.tags) ? row.tags : [];
    const performersArray = Array.isArray(row.performers) ? row.performers : [];
    const performersNames = performersArray.map((a: any) => a.name).filter(Boolean);
    const tagList = tagsArray.filter(Boolean);
    const performersStr = performersNames.join(" / ");
    const tagStr = tagList.join(", ");
    const subTitle = [performersStr, tagStr].filter(Boolean).join(" | ");

    basegroupTorrent.subTitle = subTitle;

    return basegroupTorrent;
  }
}
