import InvitePage from "@/components/InvitePage/InvitePage";

export default async function InviteByTagPage({ params }) {
  const chat_tag = (await params).chat_tag;
  return <InvitePage inviteTag={chat_tag} />;
}

