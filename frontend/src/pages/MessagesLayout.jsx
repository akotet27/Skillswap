import { Outlet, useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import ConversationList from "../components/ConversationList";

/** WhatsApp/Telegram-style split view: the conversation list always sits
 * in the left pane, the open conversation renders in the right pane via
 * <Outlet/> (ChatPage, nested under this layout in App.jsx). On narrow
 * viewports there's only room for one pane at a time -- see the
 * `.messages-*` CSS in global.css, which shows the list pane until a
 * conversation is selected, then swaps to showing only the chat pane
 * (with a back arrow inside ChatPage.jsx to return to the list). */
export default function MessagesLayout() {
  const { conversationId } = useParams();

  return (
    <div className={`messages-layout${conversationId ? " has-active-chat" : ""}`}>
      <aside className="messages-list-pane">
        <div style={{ padding: "var(--space-5)" }}>
          <h3 style={{ margin: 0 }}>Messages</h3>
        </div>
        <ConversationList activeId={conversationId} />
      </aside>

      <section className="messages-chat-pane">
        {conversationId ? (
          <Outlet />
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-3)", color: "var(--text-tertiary)" }}>
            <MessageSquare size={40} strokeWidth={1.5} />
            <p style={{ margin: 0 }}>Select a conversation to start chatting</p>
          </div>
        )}
      </section>
    </div>
  );
}
