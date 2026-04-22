import { Editor } from '@/components/Editor';

interface Props {
  params: { roomId: string };
}

export default function RoomPage({ params }: Props) {
  const serverUrl =
    process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

  return <Editor roomId={params.roomId} serverUrl={serverUrl} />;
}
