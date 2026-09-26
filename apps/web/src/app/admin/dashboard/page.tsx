import { Card } from "../../../components/ui/Card";

const metrics = [
  "Today's Sales",
  "Transactions",
  "Gross Profit",
  "Cash Variance",
];

export default function DashboardPage() {
  return (
    <div className="dashboard-page">
      <div
        style={{
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "var(--wb-navy)",
          }}
        >
          Dashboard
        </h1>

        <p
          style={{
            margin: "6px 0 0",
            color: "var(--wb-text-muted)",
          }}
        >
          Business performance and operational overview.
        </p>
      </div>

      <div className="metric-grid">
        {metrics.map((title) => (
          <Card key={title}>
            <div
              style={{
                color: "var(--wb-text-muted)",
                fontSize: 13,
              }}
            >
              {title}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 26,
                fontWeight: 900,
                color: "var(--wb-navy)",
              }}
            >
              —
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
