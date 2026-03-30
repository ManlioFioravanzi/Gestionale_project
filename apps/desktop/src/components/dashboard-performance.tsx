import type { DashboardSnapshot } from "@booking/core";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { useState } from "react";

type PerformancePeriod = "last7" | "last30" | "thisMonth" | "lastMonth";

const periodOptions: Array<{ id: PerformancePeriod; label: string }> = [
  { id: "last7", label: "Ultimi 7 giorni" },
  { id: "last30", label: "Ultimi 30 giorni" },
  { id: "thisMonth", label: "Questo mese" },
  { id: "lastMonth", label: "Mese scorso" },
];

const chartPalette = {
  navy: "#1e3a8a",
  blue: "#2563eb",
  amber: "#f59e0b",
  green: "#16a34a",
  orange: "#f97316",
  slate: "#64748b",
};

function getPeriodRange(period: PerformancePeriod) {
  const now = new Date();

  if (period === "last7") {
    return {
      start: startOfDay(subDays(now, 6)),
      end: endOfDay(now),
    };
  }

  if (period === "thisMonth") {
    return {
      start: startOfMonth(now),
      end: endOfDay(now),
    };
  }

  if (period === "lastMonth") {
    const previousMonth = subMonths(now, 1);
    return {
      start: startOfMonth(previousMonth),
      end: endOfMonth(previousMonth),
    };
  }

  return {
    start: startOfDay(subDays(now, 29)),
    end: endOfDay(now),
  };
}

function weekdayIndex(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function DashboardPerformance({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [period, setPeriod] = useState<PerformancePeriod>("last30");
  const currencyFormatter = new Intl.NumberFormat(snapshot.tenant.locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
    maximumFractionDigits: 2,
  });

  const range = getPeriodRange(period);
  const rangeDays = eachDayOfInterval({
    start: startOfDay(range.start),
    end: startOfDay(range.end),
  });

  const filteredPayments = snapshot.payments.filter((payment) => {
    const referenceDate = parseISO(payment.updatedAt);
    return referenceDate >= range.start && referenceDate <= range.end;
  });

  const filteredBookings = snapshot.bookings.filter((booking) => {
    const bookingDate = parseISO(booking.startsAt);
    return bookingDate >= range.start && bookingDate <= range.end;
  });

  const revenueByDay = new Map<string, number>();
  for (const payment of filteredPayments) {
    if (payment.status !== "paid") {
      continue;
    }

    const dayKey = format(parseISO(payment.updatedAt), "yyyy-MM-dd");
    revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + payment.amountCents);
  }

  const revenueData = rangeDays.map((day) => {
    const dayKey = format(day, "yyyy-MM-dd");
    const amountCents = revenueByDay.get(dayKey) ?? 0;

    return {
      date: format(day, "dd/MM"),
      amount: amountCents / 100,
      amountCents,
    };
  });

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const booking of filteredBookings) {
    weekdayCounts[weekdayIndex(parseISO(booking.startsAt))] += 1;
  }
  const bookingsByWeekdayData = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(
    (day, index) => ({
      day,
      bookings: weekdayCounts[index],
    }),
  );

  let paidDeposits = 0;
  let pendingDeposits = 0;
  let refundedDeposits = 0;

  for (const payment of filteredPayments) {
    if (payment.status === "paid") {
      paidDeposits += 1;
      continue;
    }

    if (payment.status === "refunded") {
      refundedDeposits += 1;
      continue;
    }

    pendingDeposits += 1;
  }

  const totalDeposits = paidDeposits + pendingDeposits + refundedDeposits;

  const depositsData = [
    { name: "Pagate", value: paidDeposits, color: chartPalette.green },
    { name: "In attesa", value: pendingDeposits, color: chartPalette.amber },
    { name: "Rimborsate", value: refundedDeposits, color: chartPalette.orange },
  ];

  let stripeVolumeCents = 0;
  let manualVolumeCents = 0;
  for (const payment of filteredPayments) {
    if (payment.provider === "stripe") {
      stripeVolumeCents += payment.amountCents;
      continue;
    }
    manualVolumeCents += payment.amountCents;
  }

  const paymentMethodData = [
    { method: "Stripe", amount: stripeVolumeCents / 100, color: chartPalette.navy },
    { method: "Manuale", amount: manualVolumeCents / 100, color: chartPalette.blue },
  ];

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Performance</h3>
          <p className="mt-1 text-sm text-slate-500">
            Monitoraggio trend operativi e finanziari per il periodo selezionato.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Periodo
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as PerformancePeriod)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {periodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Andamento fatturato</h4>
          <p className="mt-1 text-xs text-slate-500">Incassato giornaliero in euro</p>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenue-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartPalette.blue} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartPalette.blue} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="date" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => `€${Math.round(value)}`}
                  tick={{ fill: chartPalette.slate, fontSize: 12 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => currencyFormatter.format(Number(value))}
                  labelFormatter={(label) => `Data ${label}`}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={chartPalette.blue}
                  strokeWidth={2.5}
                  fill="url(#revenue-area-fill)"
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Prenotazioni per giorno della settimana</h4>
          <p className="mt-1 text-xs text-slate-500">Distribuzione dei picchi operativi</p>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bookingsByWeekdayData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: chartPalette.slate, fontSize: 12 }} width={30} />
                <Tooltip
                  formatter={(value) => [`${value} prenotazioni`, "Volume"]}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Bar dataKey="bookings" radius={[8, 8, 0, 0]} fill={chartPalette.navy} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Tasso di conversione caparre</h4>
          <p className="mt-1 text-xs text-slate-500">Pagate vs in attesa vs rimborsate</p>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={depositsData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {depositsData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const numericValue = Number(value);
                    const percentage = totalDeposits > 0 ? Math.round((numericValue / totalDeposits) * 100) : 0;
                    return [`${numericValue} (${percentage}%)`, name];
                  }}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Metodi di pagamento</h4>
          <p className="mt-1 text-xs text-slate-500">Volume transato nel periodo</p>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={paymentMethodData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                <XAxis type="number" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis
                  dataKey="method"
                  type="category"
                  tick={{ fill: chartPalette.slate, fontSize: 12 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value) => currencyFormatter.format(Number(value))}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                  {paymentMethodData.map((entry) => (
                    <Cell key={entry.method} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
