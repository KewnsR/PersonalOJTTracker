import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function TrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data || []}>
        <XAxis dataKey="name" stroke="#94A3B8" />
        <YAxis stroke="#94A3B8" />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "10px",
            color: "#e2e8f0",
          }}
        />
        <Line
          type="monotone"
          dataKey="hours"
          stroke="#22d3ee"
          strokeWidth={3}
          dot={{ fill: "#22d3ee", r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
