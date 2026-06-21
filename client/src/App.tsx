import { useEffect, useState } from "react";
import "./App.css";

const CHANNELS = ["push", "sms", "email"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABELS: Record<Channel, string> = {
  push: "Push",
  sms: "SMS",
  email: "Email",
};

interface LogEntry {
  eventId: string;
  userId: string;
  channel: Channel;
  templateId: string;
  to: string;
  status: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string | null;
}

// A valid-looking UUID that isn't seeded — lets us demo the 404 path.
const UNKNOWN_USER_ID = "00000000-0000-0000-0000-000000000000";

export default function App() {
  // --- compose form state ---
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [templateId, setTemplateId] = useState("order_shipped");
  const [dataJson, setDataJson] = useState('{ "orderId": "A-91", "name": "Asha" }');
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // --- feed state ---
  const [feed, setFeed] = useState<LogEntry[]>([]);

  // Load the real users once so the dropdown sends actual UUIDs, not hardcoded ids.
  useEffect(() => {
    fetch("/v1/users")
      .then((r) => r.json())
      .then((data: User[]) => {
        setUsers(data);
        if (data.length > 0) setUserId(data[0].id);
      })
      .catch(() => {/* server may be starting; the field stays empty */});
  }, []);

  // Poll the feed every 1.5s. Cleanup clears the timer on unmount.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/v1/notifications");
        const data = await res.json();
        if (alive) setFeed(data);
      } catch {
        /* server may be restarting; retry next tick */
      }
    }
    load();
    const id = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    let data: Record<string, string>;
    try {
      data = JSON.parse(dataJson);
    } catch {
      setMsg({ kind: "err", text: "Data needs to be valid JSON." });
      return;
    }

    try {
      const res = await fetch("/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, channel, templateId, data }),
      });
      const body = await res.json();
      if (res.ok) {
        setMsg({ kind: "ok", text: `Queued — ${body.eventId.slice(0, 8)}` });
      } else {
        setMsg({ kind: "err", text: body.error ?? "That didn't go through." });
      }
    } catch {
      setMsg({ kind: "err", text: "Can't reach the server." });
    }
  }

  return (
    <div className="page">
      <header className="masthead">
        <h1>Notifications</h1>
        <p>Send a message and watch it go out in real time.</p>
      </header>

      <form className="card compose" onSubmit={submit}>
        {/* Signature element: an iOS-style segmented control for the channel. */}
        <div className="segmented" role="group" aria-label="Channel">
          {CHANNELS.map((c) => (
            <button
              type="button"
              key={c}
              className={`seg ${channel === c ? "is-on" : ""}`}
              aria-pressed={channel === c}
              onClick={() => setChannel(c)}
            >
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="fields">
          <label className="field">
            <span>Recipient</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
              ))}
              <option value={UNKNOWN_USER_ID}>Unknown recipient</option>
            </select>
          </label>

          <label className="field">
            <span>Template</span>
            <input value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Data</span>
          <textarea
            rows={3}
            spellCheck={false}
            value={dataJson}
            onChange={(e) => setDataJson(e.target.value)}
          />
        </label>

        <div className="actions">
          <button type="submit" className="btn-primary">Send</button>
          {msg && <span className={`msg ${msg.kind}`}>{msg.text}</span>}
        </div>
      </form>

      <section className="card feed">
        <div className="feed-head">
          <h2>Activity</h2>
          <span className="live"><i /> Live</span>
        </div>

        {feed.length === 0 ? (
          <p className="empty">Nothing sent yet. Compose a message to get started.</p>
        ) : (
          <ul className="rows">
            {feed.map((e) => (
              <li className="row" key={e.eventId}>
                <span className={`dot ${e.channel}`} aria-hidden />
                <div className="row-main">
                  <span className="row-title">{CHANNEL_LABELS[e.channel]} to {e.to}</span>
                  <span className="row-sub">{e.templateId} · {e.userId}</span>
                </div>
                <span className="row-time">
                  {new Date(e.createdAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className={`pill ${e.status}`}>{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
