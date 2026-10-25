export type Trust = "official" | "research" | "press" | "community";
export const FEEDS: { id: string; name: string; trust: Trust; every: number; url: string; all?: boolean }[];
export const HN_QUERIES: string[];
export const HN_MIN_POINTS: number;
export const SECURITY_WORDS: RegExp;
export const SOURCE_TRUST: Record<string, Trust>;
