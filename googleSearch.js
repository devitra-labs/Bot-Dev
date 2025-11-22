import axios from "axios";

// ================================
//  Google Custom Search (Fallback)
// ================================
// REQUIREMENTS:
// - API Key Google
// - Search Engine ID (cx)
//
// NOTE: Gunakan Google Programmable Search Engine
// https://programmablesearchengine.google.com/
// ================================

const API_KEY = process.env.GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY";
const CX = process.env.GOOGLE_CX || "YOUR_CX_ID";

export async function googleSearch(query) {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}`;

    const res = await axios.get(url);

    if (!res.data.items) return [];

    return res.data.items.map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      image:
        item.pagemap?.cse_image?.[0]?.src ||
        item.pagemap?.metatags?.[0]?.["og:image"] || null,
    }));
  } catch (err) {
    console.error("❌ GOOGLE SEARCH ERROR:", err.response?.data || err.message);
    return [];
  }
}