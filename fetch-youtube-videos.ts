/**
 * Fetch all videos from a YouTube channel sorted by popularity (view count)
 *
 * Usage:
 *   YOUTUBE_API_KEY=your_api_key bun run fetch-youtube-videos.ts
 *
 * Get an API key from: https://console.cloud.google.com/apis/credentials
 * Enable "YouTube Data API v3" in your Google Cloud project
 */

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE = "@aidotengineer";

interface Video {
  id: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  url: string;
}

async function getChannelId(handle: string): Promise<string> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handle.replace("@", "")}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.items?.length) {
    throw new Error(`Channel not found: ${handle}`);
  }

  return data.items[0].id;
}

async function getUploadsPlaylistId(channelId: string): Promise<string> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getAllVideoIds(playlistId: string): Promise<string[]> {
  const videoIds: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&key=${API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();

    for (const item of data.items || []) {
      videoIds.push(item.contentDetails.videoId);
    }

    nextPageToken = data.nextPageToken;
    console.error(`Fetched ${videoIds.length} video IDs...`);
  } while (nextPageToken);

  return videoIds;
}

async function getVideoDetails(videoIds: string[]): Promise<Video[]> {
  const videos: Video[] = [];

  // YouTube API allows max 50 videos per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${batch.join(",")}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    for (const item of data.items || []) {
      videos.push({
        id: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        viewCount: parseInt(item.statistics.viewCount || "0"),
        likeCount: parseInt(item.statistics.likeCount || "0"),
        commentCount: parseInt(item.statistics.commentCount || "0"),
        duration: item.contentDetails.duration,
        url: `https://www.youtube.com/watch?v=${item.id}`,
      });
    }

    console.error(`Fetched details for ${videos.length}/${videoIds.length} videos...`);
  }

  return videos;
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;

  const hours = match[1] ? `${match[1]}:` : "";
  const minutes = match[2] ? match[2].padStart(hours ? 2 : 1, "0") : "0";
  const seconds = match[3] ? match[3].padStart(2, "0") : "00";

  return `${hours}${minutes}:${seconds}`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

async function main() {
  if (!API_KEY) {
    console.error("Error: YOUTUBE_API_KEY environment variable is required");
    console.error("");
    console.error("To get an API key:");
    console.error("1. Go to https://console.cloud.google.com/apis/credentials");
    console.error("2. Create a new project or select existing one");
    console.error("3. Enable 'YouTube Data API v3'");
    console.error("4. Create an API key");
    console.error("");
    console.error("Usage: YOUTUBE_API_KEY=your_key bun run fetch-youtube-videos.ts");
    process.exit(1);
  }

  console.error(`Fetching videos from ${CHANNEL_HANDLE}...\n`);

  const channelId = await getChannelId(CHANNEL_HANDLE);
  console.error(`Channel ID: ${channelId}`);

  const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
  console.error(`Uploads Playlist ID: ${uploadsPlaylistId}\n`);

  const videoIds = await getAllVideoIds(uploadsPlaylistId);
  console.error(`\nTotal videos found: ${videoIds.length}\n`);

  const videos = await getVideoDetails(videoIds);

  // Sort by view count (descending)
  videos.sort((a, b) => b.viewCount - a.viewCount);

  // Output as formatted table
  console.log("\n# All Videos from @aidotengineer sorted by popularity\n");
  console.log(`Total: ${videos.length} videos\n`);
  console.log("| Rank | Views | Likes | Duration | Title | URL |");
  console.log("|------|-------|-------|----------|-------|-----|");

  videos.forEach((video, index) => {
    const title = video.title.length > 60 ? video.title.slice(0, 57) + "..." : video.title;
    console.log(
      `| ${index + 1} | ${formatNumber(video.viewCount)} | ${formatNumber(video.likeCount)} | ${formatDuration(video.duration)} | ${title} | ${video.url} |`
    );
  });

  // Also output as JSON for programmatic use
  const jsonOutput = videos.map((v, i) => ({
    rank: i + 1,
    ...v,
    durationFormatted: formatDuration(v.duration),
  }));

  await Bun.write("youtube-videos.json", JSON.stringify(jsonOutput, null, 2));
  console.error("\n\nJSON output saved to youtube-videos.json");
}

main().catch(console.error);
