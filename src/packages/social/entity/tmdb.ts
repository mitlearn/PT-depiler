import type { IFetchSocialSiteInformationConfig, ISocialInformation } from "../types";
import axios from "axios";

// TMDb 基础 API URL
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
// TMDb 图片基础 URL (w500 是常见的海报尺寸)
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

export function build(id: string, type: 'movie' | 'tv' = 'movie'): string {
  // TMDb 的页面 URL 结构是不同的，这里构建其网站的详情页URL
  // 但通常我们更常用API获取数据
  return `https://www.themoviedb.org/${type}/${id}`;
}

export function parse(query: string): { id: string; type: 'movie' | 'tv' | 'unknown' } {
  const tmdbMovieRegex = /(?:https?:\/\/)?(?:www\.)?themoviedb\.org\/movie\/(\d+)/;
  const tmdbTvRegex = /(?:https?:\/\/)?(?:www\.)?themoviedb\.org\/tv\/(\d+)/;

  // 尝试匹配电影ID
  const tvMatch = query.match(tmdbTvRegex);
  if (tvMatch) {
    return { id: tvMatch[1] as string, type: 'tv' };
  }

  // 然后尝试匹配电影 URL
  const movieMatch = query.match(tmdbMovieRegex);
  if (movieMatch) {
    return { id: movieMatch[1] as string, type: 'movie' };
  }

  // 如果是纯数字 ID 或其他无法识别的字符串，默认按电影处理
  return { id: query, type: 'movie' };
}

interface ITMDBMovieApiResp {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  genres: Array<{ id: number; name: string }>;
  overview: string;
  release_date: string;
  [key: string]: any;
}

interface ITMDBTvApiResp {
    id: number;
    name: string;
    original_name: string;
    poster_path: string | null;
    vote_average: number;
    vote_count: number;
    genres: Array<{ id: number; name: string }>;
    overview: string;
    first_air_date: string;
    status: string;
    [key: string]: any;
}

type ITMDBApiResp = ITMDBMovieApiResp | ITMDBTvApiResp;

export async function fetchInformation(
  id: string,
  config: IFetchSocialSiteInformationConfig = {},
): Promise<ISocialInformation> {
  const parsedInfo = parse(String(id));
  const realId = parsedInfo.id;
  const itemType = parsedInfo.type; // 获取解析出来的类型

  const resDict = {
    site: "themoviedb",
    id: realId,
    title: "",
    poster: "",
    ratingScore: 0,
    ratingCount: 0,
    createAt: 0,
 } as ISocialInformation;

 try {
    let apiUrl = '';
    // 根据影片类型构建正确的 API 请求 URL
    if (itemType === 'movie') {
      apiUrl = `${TMDB_API_BASE_URL}/movie/${realId}`;
    } else { // 如果不是 'movie'，那它一定是 'tv'
      apiUrl = `${TMDB_API_BASE_URL}/tv/${realId}`;
    }

    // 发送 HTTP GET 请求到 TMDb API
    const { data } = await axios.get<ITMDBApiResp>(apiUrl, {
      params: {
        language: config.language ?? "zh-CN", // 默认请求中文数据，可通过 config 覆盖
      },
      headers: {
        Authorization: `Bearer ${config.socialSite.themoviedb.apikey}`, // 使用 Bearer Token 认证
      },
      timeout: config.timeout ?? 10e3, // 默认超时时间 10 秒
      responseType: "json",
    });

    // 根据影片类型解析并填充数据
    if (itemType === 'movie') {
      const movieData = data as ITMDBMovieApiResponse;
      resDict.title = movieData.title || movieData.original_title || ""; // 优先使用本地化标题，否则使用原始标题
      resDict.poster = movieData.poster_path ? `${TMDB_IMAGE_BASE_URL}${movieData.poster_path}` : ""; // 拼接完整海报 URL
      resDict.ratingScore = movieData.vote_average ?? 0;
      resDict.ratingCount = movieData.vote_count ?? 0;
    } else { // 电视节目
        const tvData = data as ITMDBTvApiResponse;
        resDict.title = tvData.name || tvData.original_name || "";
        resDict.poster = tvData.poster_path ? `${TMDB_IMAGE_BASE_URL}${tvData.poster_path}` : "";
        resDict.ratingScore = tvData.vote_average ?? 0;
        resDict.ratingCount = tvData.vote_count ?? 0;
    }

  } catch (error) {
    console.warn(`无法请求到 TMDb 内容（ID: "${realId}", 类型: ${itemType}）:`);

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // 请求已发出，服务器以状态码响应，但状态码超出 2xx 的范围
        console.warn(`  HTTP 错误: 状态码 ${error.response.status} - ${error.response.statusText}`);
        if (error.response.status === 401) {
            console.warn("  可能原因: API Key 无效。请检查 'config.socialSite.themoviedb.apikey' 是否正确。");
        } else if (error.response.status === 404) {
            console.warn(`  可能原因: 影片/节目未找到。ID "${realId}" 可能不正确，或该 ID 不属于 "${itemType}" 类型。`);
        } else if (error.response.data && typeof error.response.data === 'object') {
            // 如果 API 响应中包含具体的错误信息，也一并打印
            console.warn("  TMDb API 错误详情:", error.response.data);
        }
      } else if (error.request) {
        // 请求已发出，但没有收到任何响应
        // 这通常表示网络问题、DNS 解析失败或服务器不可达
        console.warn("  网络错误: 未能从 TMDb API 收到响应。请检查您的网络连接或 TMDb 服务器状态。");
      } else {
        // 在设置请求时发生了一些事情，这触发了一个错误
        console.warn("  请求设置错误:", error.message);
      }
    } else {
      // 捕获非 Axios 错误，例如数据解析错误或其他程序逻辑错误
      console.warn("  发生意外错误:", error);
    }
  } finally {
    // 无论成功或失败，都更新创建时间
    resDict.createAt = +Date.now();
  }

  return resDict;
}