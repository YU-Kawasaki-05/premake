/**
 * PostgREST の `.or()` / `.ilike()` に渡す検索語を無害化する。
 * PostgREST は値内の , ( ) : * . " をフィルタ構文トークンとして解釈するため除去し、
 * ilike ワイルドカード(% _)も除いて予測可能な部分一致にする。
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .trim()
    .replace(/[,()*:."'\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
