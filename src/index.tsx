import { Hono } from "hono";
import { renderer } from "./renderer";

type Bindings = {
  DB: D1Database;
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  MAILGUN_BASE_URL: string;
};

type Summary = {
  id: number;
  email: string;
  uuid: number;
  repository_name: string;
  topic: string;
  summary: string;
  created_at: number;
  status: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(renderer);

app.get("/", (c) => {
  return c.render(<h1>Hello!</h1>);
});

app.post("/send-test", async (c) => {
  const env = c.env;
  const result = await sendPendingSummaries(env);
  return c.text(`Done. ${result.total} summaries.`);
});

async function sendPendingSummaries(env: Bindings): Promise<{ total: number }> {
  const db = env.DB;
  const { results } = await db
    .prepare("SELECT * FROM summaries WHERE status = ?")
    .bind("pending")
    .all<Summary>();

  for (const row of results) {
    const { email, summary, topic } = row;

    const mailgunUrl = `${env.MAILGUN_BASE_URL}/${env.MAILGUN_DOMAIN}/messages`;
    const params = new URLSearchParams();
    params.append("from", `no-reply@${env.MAILGUN_DOMAIN}`);
    params.append("to", email);
    params.append(
      "subject",
      "【毎日配信】iwashi からニュース要約のお知らせです。"
    );
    params.append(
      "text",
      `登録した【${topic}】のニュースを要約しました。\n\n${summary}`
    );

    const response = await fetch(mailgunUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const responseBody = await response.text();

    // 一度だけ送信する場合
    // if (response.ok) {
    //   await db
    //     .prepare("UPDATE summaries SET status = ? WHERE id = ?")
    //     .bind("completed", id)
    //     .run();
    // } else {
    //   console.error(
    //     `Failed to send email to ${email}:`,
    //     response.status,
    //     responseBody
    //   );
    // }

    console.log(
      `Sent email to ${email} with status ${response.status}:`,
      responseBody
    );
  }

  return { total: results.length };
}

export default {
  fetch: app.fetch,

  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    await sendPendingSummaries(env);
  },
};
