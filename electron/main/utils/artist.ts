export const formatArtist = (artists: any): string => {
  if (Array.isArray(artists)) {
    return artists
      .map((ar: any) => (typeof ar === "string" ? ar : ar?.name || ""))
      .filter((name: string) => name && name.trim().length > 0)
      .join(", ");
  }
  if (typeof artists === "string" && artists.trim().length > 0) {
    return artists;
  }
  return "未知艺术家";
};
