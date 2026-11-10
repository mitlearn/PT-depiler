/**
 * @TVVaultAPI https://tv-vault.me/kb.php?id=61 (login required; user-provided documentation excerpts)
 * @JackettRemoval https://github.com/Jackett/Jackett/pull/12496
 * TV-Vault prohibits automated HTML scraping. Search exclusively through its XML API.
 */
import type { ISearchEntryRequestConfig, ISearchResult, ISiteMetadata, ITorrent } from "../types";
import { EResultParseStatus } from "../types";
import PrivateSite from "../schemas/AbstractPrivateSite.ts";
import { parseSizeString } from "../utils/filesize.ts";

const SEARCH_INTERVAL_MS = 5 * 60 * 1000; // Conservative limit reported in https://github.com/Jackett/Jackett/issues/16204
let lastSearchAt = 0;

// XML field names have not been verified: the sample pasted into chat lost its XML tags.
function field(element: Element | null, ...names: string[]): string {
  if (!element) return "";
  const wanted = names.map((name) => name.toLowerCase());
  for (const child of Array.from(element.children)) {
    if (wanted.includes(child.localName.toLowerCase())) return child.textContent?.trim() ?? "";
  }
  for (const attribute of Array.from(element.attributes)) {
    if (wanted.includes(attribute.name.toLowerCase())) return attribute.value.trim();
  }
  return "";
}

function numberField(element: Element | null, ...names: string[]): number | undefined {
  const raw = field(element, ...names).replace(/,/g, "");
  return raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
}

function parseXmlSearch(xml: Document, siteUrl: string, authkey: string, torrentPass: string): ITorrent[] {
  const root = xml.documentElement;
  if (!root || root.localName.toLowerCase() !== "searchresults" || root.getElementsByTagName("parsererror").length) {
    throw new Error("Invalid TV-Vault XML response");
  }

  const error = Array.from(root.getElementsByTagName("*")).find(
    (element) => element.localName.toLowerCase() === "searcherror",
  );
  if (error && error.getAttribute("value") !== "0") {
    // Do not include the response in errors; it could contain a personal credential.
    const code = error.getAttribute("value") ?? "unknown";
    throw new Error(`TV-Vault XML search error ${code}`);
  }

  const torrents = Array.from(root.getElementsByTagName("*")).filter((element) => {
    if (["torrent", "release"].includes(element.localName.toLowerCase())) return true;
    const details = field(element, "details", "detailsurl", "link", "url");
    try {
      return new URL(details).searchParams.has("torrentid");
    } catch {
      return false;
    }
  });

  return torrents.flatMap((element): ITorrent[] => {
    let group: Element | null = element.parentElement;
    while (group && !["group", "show", "series", "torrentgroup"].includes(group.localName.toLowerCase())) {
      const groupLink = field(group, "details", "detailsurl", "link", "url");
      if (groupLink && /torrents\.php\?id=\d+(?:$|&amp;|&)/.test(groupLink) && !groupLink.includes("torrentid=")) break;
      group = group.parentElement;
    }

    const rawDetails = field(element, "details", "detailsurl", "link", "url");
    let detailId = "";
    let groupId = field(group, "id", "groupid", "showid");
    try {
      const parsed = new URL(rawDetails, siteUrl);
      // Never follow an untrusted host with personal download credentials.
      if (parsed.hostname !== new URL(siteUrl).hostname) return [];
      detailId = parsed.searchParams.get("torrentid") ?? parsed.searchParams.get("id") ?? "";
      groupId ||= parsed.searchParams.get("id") ?? "";
    } catch {
      return [];
    }
    const id = field(element, "torrentid") || detailId || field(element, "id");
    if (!id || !/^\d+$/.test(id)) return [];

    const details = new URL("torrents.php", siteUrl);
    details.searchParams.set("id", groupId || id);
    if (groupId && groupId !== id) details.searchParams.set("torrentid", id);

    const groupTitle = field(group, "name", "title", "groupname", "showname");
    const releaseTitle = field(element, "name", "title", "description", "release", "releasename");
    const title = [groupTitle, groupTitle && releaseTitle.startsWith(groupTitle) ? "" : releaseTitle].filter(Boolean).join(" ");
    if (!title) return [];

    const rawSize = field(element, "size", "bytes", "filesize", "sizebytes");
    const numericSize = Number(rawSize);
    const size = /^\d+$/.test(rawSize) ? numericSize : parseSizeString(rawSize);
    const time = numberField(element, "timestamp", "addedtimestamp", "uploadedtimestamp", "time", "added", "date");

    const torrent: ITorrent = {
      site: "tvvault",
      id,
      title,
      url: details.toString(),
      category: "TV",
      ...(size > 0 ? { size } : {}),
      ...(time && time > 0 ? { time: time < 1e12 ? time * 1000 : time } : {}),
      seeders: numberField(element, "seeders", "seeds"),
      leechers: numberField(element, "leechers", "leeches"),
      completed: numberField(element, "snatches", "snatched", "grabs", "completed"),
    };

    const imdb = field(group, "imdbid", "imdb");
    if (imdb) torrent.ext_imdb = imdb;

    // XML search may omit <download>. Use the explicitly configured personal credentials only.
    const providedDownload = field(element, "download", "downloadurl");
    if (providedDownload) {
      try {
        const parsed = new URL(providedDownload, siteUrl);
        if (parsed.hostname === new URL(siteUrl).hostname) torrent.link = parsed.toString();
      } catch { /* No valid download URL in this record. */ }
    } else if (authkey && torrentPass) {
      const download = new URL("torrents.php", siteUrl);
      download.searchParams.set("action", "download");
      download.searchParams.set("id", id);
      download.searchParams.set("authkey", authkey);
      download.searchParams.set("torrent_pass", torrentPass);
      torrent.link = download.toString();
    }
    return [torrent];
  });
}

export const siteMetadata: ISiteMetadata = {
  version: 1,
  id: "tvvault",
  name: "TV-Vault",
  description: "TV-Vault is a private tracker for classic television shows (XML search API only).",
  tags: ["电视剧"],
  timezoneOffset: "+0000",
  type: "private",
  schema: "AbstractPrivateSite",
  urls: ["https://tv-vault.me/"],
  userInputSettingMeta: [
    {
      name: "authkey",
      label: "Authkey",
      hint: "从 TV-Vault 的种子下载链接或 RSS 地址中获取。不要将密钥粘贴到公开对话或代码中。",
      required: true,
    },
    {
      name: "torrentPass",
      label: "Torrent Pass",
      hint: "选填；从种子下载链接中获取，用于生成下载地址。请勿公开。",
      required: false,
    },
  ],
  search: { skipWhiteSpacePlaceholder: true },
  // No background HTML scraping, user-info queries, or automatic content-script list parsing.
};

export default class TVVault extends PrivateSite {
  public override async getSearchResult(
    keywords?: string,
    _searchEntry: ISearchEntryRequestConfig = {},
  ): Promise<ISearchResult> {
    if (!this.allowSearch || !keywords?.trim()) {
      return { status: EResultParseStatus.passParse, data: [] };
    }

    const authkey = this.userConfig.inputSetting?.authkey?.trim();
    const torrentPass = this.userConfig.inputSetting?.torrentPass?.trim() ?? "";
    if (!authkey) {
      return { status: EResultParseStatus.noUserInput, statusMsg: "请先配置 TV-Vault Authkey", data: [] };
    }

    const input = keywords.trim();
    const imdbSearch = input.startsWith("imdb|");
    const query = imdbSearch ? input.slice(5).trim() : input;
    if ((imdbSearch && !/^tt\d+$/i.test(query)) || (!imdbSearch && query.length < 3)) {
      return {
        status: EResultParseStatus.passParse,
        statusMsg: "TV-Vault 搜索需要至少三个字符，IMDb 搜索需要 tt 开头的有效编号",
        data: [],
      };
    }

    const now = Date.now();
    // Reserve synchronously before the first await: parallel searches in this runtime cannot bypass the interval.
    if (now - lastSearchAt < SEARCH_INTERVAL_MS) {
      return { status: EResultParseStatus.passParse, statusMsg: "TV-Vault XML 搜索间隔至少五分钟，请稍后再试", data: [] };
    }
    lastSearchAt = now;

    try {
      const saved = (await this.retrieveRuntimeSettings<number>("xmlSearchLastRequestAt")) ?? 0;
      if (now - saved < SEARCH_INTERVAL_MS) {
        return { status: EResultParseStatus.passParse, statusMsg: "TV-Vault XML 搜索间隔至少五分钟，请稍后再试", data: [] };
      }
      await this.storeRuntimeSettings("xmlSearchLastRequestAt", now);
      const params: Record<string, string | number> = { query: "get", authkey, enablegrouping: 1 };
      if (imdbSearch) params.imdbid = query;
      else params.searchstr = query;
      const { data } = await this.request<string>({ url: "/xmlsearch.php", params, responseType: "text" }, false);
      const xml = new DOMParser().parseFromString(data, "application/xml");
      const parsed = parseXmlSearch(xml, this.url, authkey, torrentPass);
      return { status: parsed.length ? EResultParseStatus.success : EResultParseStatus.noResults, data: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = message.match(/^TV-Vault XML search error (\d+)$/)?.[1];
      const reason: Record<string, string> = {
        "1": "未提供 API 身份验证信息",
        "2": "Authkey 无效或账户已停用",
        "3": "当前账户无权使用 XML 搜索",
        "10": "至少需要一个搜索条件",
        "100": "请求过于频繁，请稍后再试",
        "101": "此搜索成本过高，请缩小范围或延长间隔",
        "250": "此搜索类型暂不可用",
      };
      return {
        status: EResultParseStatus.parseError,
        statusMsg: code ? (reason[code] ?? `TV-Vault API 错误 ${code}`) : "TV-Vault XML 搜索失败，请检查站点权限与返回格式",
        data: [],
      };
    }
  }
}
