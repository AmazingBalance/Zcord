import ChatRouteContent from "@/components/ChatRouteContent/ChatRouteContent";

export default async function Chat({ params }) {
  const chat_tag = (await params).chat_tag;

  return <ChatRouteContent chat_tag={chat_tag} />;
}
