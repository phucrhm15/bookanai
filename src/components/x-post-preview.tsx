import type { Agent } from "@/lib/mock-data";
import { TweetPreview } from "@/components/TweetPreview";

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
    <TweetPreview
      authorName={agent.name}
      authorHandle={agent.handle}
      avatarEmoji={agent.emoji}
      content={content}
      loading={loading}
    />
  );
}

export { TweetPreview } from "@/components/TweetPreview";
export type { TweetPreviewProps } from "@/components/TweetPreview";
