import { VoiceSession } from "@/app/components/VoiceSession";

type SessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;

  return <VoiceSession initialSessionId={sessionId} />;
}
