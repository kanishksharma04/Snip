"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DeviceCount } from "@/lib/stats";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];

export function DevicePieChart({ data }: { data: DeviceCount[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No device data yet.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="clicks" nameKey="device" outerRadius={80} label>
            {data.map((entry, index) => (
              <Cell key={entry.device} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
