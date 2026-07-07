"use client";

// @implements v2-10 患者選択(既存検索 / 新規入力)

import { Check, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PatientMatch, searchPatients } from "@/features/bookings/actions";

export function PatientPicker({ slug }: { slug: string }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientMatch[]>([]);
  const [picked, setPicked] = useState<PatientMatch | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch() {
    startTransition(async () => {
      setResults(await searchPatients(slug, query));
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <Label>患者</Label>
        <div className="flex gap-1 text-[12.5px]">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`rounded px-2 py-0.5 ${mode === "existing" ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "text-muted-foreground"}`}
          >
            既存患者
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("new");
              setPicked(null);
            }}
            className={`rounded px-2 py-0.5 ${mode === "new" ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "text-muted-foreground"}`}
          >
            新規患者
          </button>
        </div>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          {/* 選択済み患者 id */}
          <input type="hidden" name="patientId" value={picked?.id ?? ""} />
          {picked ? (
            <div className="flex items-center justify-between rounded bg-[var(--primary-soft)] px-2.5 py-1.5 text-sm">
              <span>
                <Check className="mr-1 inline size-3.5 text-[var(--status-confirmed)]" />
                {picked.name}
                {picked.phone && (
                  <span className="ml-2 text-[12.5px] text-muted-foreground">{picked.phone}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline"
              >
                変更
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  placeholder="名前・かな・電話で検索"
                  aria-label="患者検索"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={runSearch}
                  disabled={pending}
                  aria-label="検索"
                >
                  <Search className="size-4" />
                </Button>
              </div>
              {results.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded border border-border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(p)}
                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-[var(--paper)]"
                      >
                        <span>{p.name}</span>
                        <span className="text-[12.5px] text-muted-foreground">
                          {p.kana} {p.phone}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query && !pending && results.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">
                  該当なし。「新規患者」で登録できます。
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="np-name" className="text-[12.5px]">
              氏名
            </Label>
            <Input id="np-name" name="newPatientName" placeholder="山田 花子" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-kana" className="text-[12.5px]">
              かな
            </Label>
            <Input id="np-kana" name="newPatientKana" placeholder="やまだ はなこ" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-phone" className="text-[12.5px]">
              電話
            </Label>
            <Input id="np-phone" name="newPatientPhone" type="tel" />
          </div>
        </div>
      )}
    </div>
  );
}
