import styles from "./page.module.css";

import InvitePage from "@/components/InvitePage/InvitePage";

export default async function Chat({ params }) {
    const chat_invite = (await params).chat_invite;

    return <InvitePage chat_invite={chat_invite} type="chat" />;
}
