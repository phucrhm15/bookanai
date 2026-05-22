import type { Agent } from "@/lib/mock-data";
import { Bookmark, Heart, MessageCircle, Repeat2, BarChart2, Share, BadgeCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function XPostPreview({
  agent,
  content,
  loading,
}: {
  agent: Agent;
  content: string | null;
  loading: boolean;
}) {
  return (
    <article className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-xl">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-neon font-display text-xl text-neon-foreground shadow-neon">
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="truncate font-semibold text-foreground">{agent.name}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-muted-foreground">{agent.handle} · 1m</span>
          </div>

          <div className="mt-2 min-h-[100px] whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {loading ? (
              <div className="space-y-2 pt-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[90%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
            ) : content ? (
              content
            ) : (
              <span className="text-muted-foreground">
                Your generated post will appear here as a live X preview.
              </span>
            )}
          </div>

          {/* Inline visual for image agent */}
          {!loading && content && agent.id === "meme-image-gen" && (
            <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
              <div className="grid-bg flex h-44 items-center justify-center bg-gradient-panel">
                <span className="font-display text-5xl">🐸💎</span>
              </div>
            </div>
          )}

          <div className="mt-4 flex max-w-md items-center justify-between text-muted-foreground">
            <XAction icon={<MessageCircle className="h-4 w-4" />} label="42" />
            <XAction icon={<Repeat2 className="h-4 w-4" />} label="128" accent="text-success" />
            <XAction icon={<Heart className="h-4 w-4" />} label="1.2K" accent="text-magenta" />
            <XAction icon={<BarChart2 className="h-4 w-4" />} label="9.4K" />
            <div className="flex items-center gap-1">
              <button className="rounded-full p-1.5 hover:bg-primary/10 hover:text-primary">
                <Bookmark className="h-4 w-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-primary/10 hover:text-primary">
                <Share className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function XAction({
  icon,
  label,
  accent = "text-primary",
}: {
  icon: React.ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <button className={`group flex items-center gap-1.5 text-xs transition-colors hover:${accent}`}>
      <span className="rounded-full p-1.5 group-hover:bg-primary/10">{icon}</span>
      {label}
    </button>
  );
}
