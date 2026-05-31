import type { DashboardSnapshot } from "@booking/core";
import type { CSSProperties, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";

import type { AppLanguage } from "./i18n";
import { StatusBadge } from "./components/status-badge";
import type { ToastTone } from "./components/toast-stack";

type StayStatus = "confirmed" | "checked_in" | "option" | "maintenance";
type StayTone = "blue" | "green" | "magenta" | "orange";

interface RoomUnit {
  id: string;
  label: string;
}

interface RoomGroup {
  id: string;
  label: string;
  rooms: RoomUnit[];
}

interface RoomStay {
  id: string;
  roomId: string;
  guest: string;
  startDay: number;
  endDay: number;
  guests: number;
  board: string;
  source: string;
  status: StayStatus;
  tone: StayTone;
}

interface DraggedRoom {
  roomId: string;
  sourceGroupId: string;
}

interface RoomDropTarget {
  groupId: string;
  targetRoomId?: string;
}

interface RoomPlanningBoardProps {
  snapshot: DashboardSnapshot;
  searchQuery: string;
  language: AppLanguage;
  locale: string;
  onNotify: (tone: ToastTone, text: string) => void;
}

const DAY_COUNT = 24;
const BASE_YEAR = 2026;
const BASE_MONTH = 7;

const DEFAULT_ROOM_GROUPS: RoomGroup[] = [
  {
    id: "matrimoniale",
    label: "Camera Matrimoniale",
    rooms: [
      { id: "105", label: "105" },
      { id: "106", label: "106" },
      { id: "208", label: "208" },
      { id: "209", label: "209" },
      { id: "210", label: "210" },
      { id: "310", label: "310" },
      { id: "311", label: "311" },
      { id: "312", label: "312" },
      { id: "313", label: "313" },
      { id: "410", label: "410" },
      { id: "411", label: "411" },
      { id: "412", label: "412" },
      { id: "413", label: "413" },
      { id: "414", label: "414" },
      { id: "415", label: "415" },
    ],
  },
  {
    id: "suite",
    label: "Suite",
    rooms: [
      { id: "301", label: "301 - Smeraldo" },
      { id: "302", label: "302 - Corallo" },
      { id: "303", label: "303 - Gemma" },
      { id: "304", label: "304 - Diamante" },
      { id: "305", label: "305 - Oro" },
      { id: "306", label: "306 - Cristallo" },
      { id: "307", label: "307 - Quarzo" },
      { id: "308", label: "308 - Platino" },
      { id: "409", label: "409 - Porcellana" },
      { id: "410b", label: "410B - Granito" },
      { id: "411b", label: "411B - Argento" },
      { id: "412b", label: "412B - Avorio" },
    ],
  },
  {
    id: "singola",
    label: "Camera Singola",
    rooms: [
      { id: "501", label: "501" },
      { id: "502", label: "502" },
      { id: "503", label: "503" },
      { id: "504", label: "504" },
    ],
  },
];

const ROOM_STAYS: RoomStay[] = [
  { id: "stay-rossini", roomId: "106", guest: "Rossini", startDay: 1, endDay: 6, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-rosicki", roomId: "105", guest: "Rosicki", startDay: 6, endDay: 10, guests: 2, board: "HB", source: "OTA", status: "checked_in", tone: "blue" },
  { id: "stay-verdi", roomId: "105", guest: "Verdi", startDay: 10, endDay: 12, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-tiranti", roomId: "105", guest: "Tiranti", startDay: 14, endDay: 18, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-scarri", roomId: "105", guest: "Scarri", startDay: 18, endDay: 23, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-bianchetti", roomId: "208", guest: "Bianchetti", startDay: 1, endDay: 6, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-sopofidis", roomId: "208", guest: "Sopofidis", startDay: 9, endDay: 13, guests: 2, board: "HB", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-provini", roomId: "208", guest: "Provini", startDay: 18, endDay: 22, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-cracchetti", roomId: "209", guest: "Cracchetti", startDay: 1, endDay: 4, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-bianchi", roomId: "209", guest: "Bianchi", startDay: 4, endDay: 8, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-amedei", roomId: "209", guest: "Amedei", startDay: 12, endDay: 17, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-promo-209", roomId: "209", guest: "Promo weekend", startDay: 21, endDay: 25, guests: 2, board: "RO", source: "Revenue", status: "option", tone: "magenta" },
  { id: "stay-colombo", roomId: "210", guest: "Colombo", startDay: 1, endDay: 5, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-aversano", roomId: "210", guest: "Aversano", startDay: 6, endDay: 10, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-amatori", roomId: "210", guest: "Amatori", startDay: 10, endDay: 14, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-romizi", roomId: "210", guest: "Romizi", startDay: 15, endDay: 24, guests: 2, board: "B&B", source: "Web", status: "checked_in", tone: "green" },
  { id: "stay-allighieri", roomId: "310", guest: "Allighieri", startDay: 2, endDay: 6, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-rosa", roomId: "310", guest: "Rosa", startDay: 7, endDay: 13, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-wayner", roomId: "310", guest: "Wayne", startDay: 17, endDay: 24, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-neri-311", roomId: "311", guest: "Neri", startDay: 1, endDay: 2, guests: 2, board: "B&B", source: "Walk-in", status: "checked_in", tone: "blue" },
  { id: "stay-blacky", roomId: "311", guest: "Blacky", startDay: 3, endDay: 7, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-ferro", roomId: "311", guest: "Ferro", startDay: 11, endDay: 18, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-johnson", roomId: "312", guest: "Johnson", startDay: 2, endDay: 6, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-neri-312", roomId: "312", guest: "Neri", startDay: 7, endDay: 13, guests: 2, board: "HB", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-uva", roomId: "312", guest: "Uva", startDay: 17, endDay: 22, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-rossi-313", roomId: "313", guest: "Rossi", startDay: 2, endDay: 6, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-angiolieri-313", roomId: "313", guest: "Angiolieri", startDay: 6, endDay: 10, guests: 2, board: "HB", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-rosina", roomId: "313", guest: "Rosina", startDay: 15, endDay: 21, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-tasso", roomId: "410", guest: "Tasso", startDay: 2, endDay: 11, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-bluesy", roomId: "410", guest: "Bluesy", startDay: 8, endDay: 14, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-castagna", roomId: "410", guest: "Castagna", startDay: 17, endDay: 24, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-mirti", roomId: "411", guest: "Mirti", startDay: 1, endDay: 4, guests: 2, board: "HB", source: "Diretta", status: "checked_in", tone: "blue" },
  { id: "stay-angiolieri-411", roomId: "411", guest: "Angiolieri", startDay: 4, endDay: 8, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-rossini-411", roomId: "411", guest: "Rossini", startDay: 15, endDay: 21, guests: 2, board: "HB", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-verdi-412", roomId: "412", guest: "Verdi", startDay: 4, endDay: 10, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-fire", roomId: "412", guest: "Fire", startDay: 10, endDay: 14, guests: 2, board: "RO", source: "Revenue", status: "option", tone: "magenta" },
  { id: "stay-bellish", roomId: "412", guest: "Bellish", startDay: 14, endDay: 19, guests: 2, board: "B&B", source: "Web", status: "checked_in", tone: "green" },
  { id: "stay-borducci", roomId: "413", guest: "Borducci", startDay: 1, endDay: 4, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-keywse", roomId: "413", guest: "Keywse", startDay: 4, endDay: 9, guests: 2, board: "HB", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-arazy", roomId: "413", guest: "Arazy", startDay: 10, endDay: 13, guests: 2, board: "RO", source: "Revenue", status: "option", tone: "magenta" },
  { id: "stay-rossi-413", roomId: "413", guest: "Rossi", startDay: 13, endDay: 16, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-greyblack", roomId: "413", guest: "GreyBlack", startDay: 19, endDay: 23, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-rossini-414", roomId: "414", guest: "Rossini", startDay: 4, endDay: 8, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-pallino", roomId: "415", guest: "Pallino", startDay: 1, endDay: 4, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-van-nisterloy", roomId: "415", guest: "Van Nisterloy", startDay: 9, endDay: 20, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-glass", roomId: "301", guest: "Glass", startDay: 1, endDay: 4, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-friggettelli", roomId: "301", guest: "Friggettelli", startDay: 4, endDay: 10, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-bossi", roomId: "301", guest: "Bossi", startDay: 10, endDay: 12, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-rogano", roomId: "301", guest: "Rogano", startDay: 12, endDay: 14, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-caplalvi", roomId: "301", guest: "Caplalvi", startDay: 16, endDay: 20, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-muller", roomId: "302", guest: "Muller", startDay: 1, endDay: 5, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-barone", roomId: "302", guest: "Barone", startDay: 7, endDay: 10, guests: 2, board: "HB", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-simon", roomId: "302", guest: "Simon", startDay: 13, endDay: 17, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-restauro-302", roomId: "302", guest: "Restauro bagno", startDay: 18, endDay: 21, guests: 0, board: "OOO", source: "Housekeeping", status: "maintenance", tone: "orange" },
  { id: "stay-colombetti", roomId: "303", guest: "Colombetti", startDay: 4, endDay: 11, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-fioravanti", roomId: "303", guest: "Fioravanti", startDay: 11, endDay: 16, guests: 2, board: "HB", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-balzaretti", roomId: "303", guest: "Balzaretti", startDay: 18, endDay: 22, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-gamb", roomId: "304", guest: "Gamb...", startDay: 5, endDay: 7, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-ciccotti", roomId: "304", guest: "Ciccotti", startDay: 7, endDay: 10, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-vela", roomId: "304", guest: "Vela", startDay: 14, endDay: 17, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-restauro-304", roomId: "304", guest: "Restauro suite", startDay: 18, endDay: 21, guests: 0, board: "OOO", source: "Housekeeping", status: "maintenance", tone: "orange" },
  { id: "stay-pellegrini", roomId: "305", guest: "Pellegrini", startDay: 12, endDay: 17, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-gruppo-avis", roomId: "306", guest: "Gruppo Avis M...", startDay: 1, endDay: 3, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-napoletano", roomId: "306", guest: "Napoletano", startDay: 4, endDay: 9, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-sferrazza", roomId: "306", guest: "Sferrazza", startDay: 9, endDay: 12, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-scura", roomId: "306", guest: "Scura", startDay: 17, endDay: 24, guests: 2, board: "HB", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-tortorello", roomId: "307", guest: "Tortorello", startDay: 5, endDay: 10, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-sferrazza-307", roomId: "307", guest: "Sferrazza", startDay: 10, endDay: 12, guests: 2, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-bassi", roomId: "307", guest: "Bassi", startDay: 17, endDay: 20, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-allestimento", roomId: "308", guest: "Allestimento", startDay: 5, endDay: 9, guests: 0, board: "OOO", source: "Housekeeping", status: "maintenance", tone: "orange" },
  { id: "stay-bartolomei", roomId: "308", guest: "Bartolomei", startDay: 14, endDay: 24, guests: 2, board: "HB", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-sunrise", roomId: "409", guest: "Sunrise", startDay: 2, endDay: 6, guests: 2, board: "B&B", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-rossi-409", roomId: "409", guest: "Rossi", startDay: 11, endDay: 16, guests: 2, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-bothroid", roomId: "410b", guest: "Bothroid", startDay: 6, endDay: 13, guests: 2, board: "B&B", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-carta", roomId: "411b", guest: "Carta", startDay: 14, endDay: 24, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-tour-agency", roomId: "412b", guest: "Tour Agency", startDay: 1, endDay: 5, guests: 2, board: "HB", source: "Agenzia", status: "confirmed", tone: "blue" },
  { id: "stay-longo", roomId: "501", guest: "Longo", startDay: 2, endDay: 7, guests: 1, board: "B&B", source: "Diretta", status: "confirmed", tone: "blue" },
  { id: "stay-riva", roomId: "502", guest: "Riva", startDay: 8, endDay: 14, guests: 1, board: "RO", source: "Web", status: "confirmed", tone: "blue" },
  { id: "stay-minardi", roomId: "503", guest: "Minardi", startDay: 15, endDay: 19, guests: 1, board: "B&B", source: "OTA", status: "confirmed", tone: "blue" },
  { id: "stay-opzione-504", roomId: "504", guest: "Opzione vendita", startDay: 19, endDay: 24, guests: 1, board: "RO", source: "Revenue", status: "option", tone: "magenta" },
];

const STATUS_LABELS: Record<AppLanguage, Record<StayStatus, string>> = {
  it: {
    confirmed: "Confermata",
    checked_in: "In casa",
    option: "Opzione",
    maintenance: "Blocco",
  },
  en: {
    confirmed: "Confirmed",
    checked_in: "In house",
    option: "Option",
    maintenance: "Blocked",
  },
};

function getMonthDate(monthOffset: number) {
  return new Date(BASE_YEAR, BASE_MONTH + monthOffset, 1);
}

function getMonthTitle(monthOffset: number, locale: string) {
  const date = getMonthDate(monthOffset);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function buildDays(monthOffset: number, language: AppLanguage) {
  const monthDate = getMonthDate(monthOffset);
  const weekdayLabels =
    language === "en"
      ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
      : ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
    return {
      day: index + 1,
      weekday: weekdayLabels[date.getDay()],
      weekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });
}

function clampStay(stay: RoomStay) {
  return {
    ...stay,
    startDay: Math.max(1, Math.min(DAY_COUNT, stay.startDay)),
    endDay: Math.max(2, Math.min(DAY_COUNT + 1, stay.endDay)),
  };
}

function stayOverlapsDay(stay: RoomStay, day: number) {
  return day >= stay.startDay && day < stay.endDay;
}

function getGroupOccupancy(group: RoomGroup, day: number) {
  const roomIds = new Set(group.rooms.map((room) => room.id));
  return ROOM_STAYS.filter(
    (stay) =>
      roomIds.has(stay.roomId) &&
      stay.status !== "maintenance" &&
      stayOverlapsDay(stay, day),
  ).length;
}

function getStatusBadgeVariant(status: StayStatus) {
  if (status === "checked_in") {
    return "success";
  }

  if (status === "option") {
    return "warning";
  }

  if (status === "maintenance") {
    return "error";
  }

  return "info";
}

function createEditableId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getNextRoomLabel(groups: RoomGroup[]) {
  const numericLabels = groups
    .flatMap((group) => group.rooms)
    .map((room) => Number.parseInt(room.label, 10))
    .filter((value) => Number.isFinite(value));
  const nextNumber = numericLabels.length > 0 ? Math.max(...numericLabels) + 1 : 101;

  return String(nextNumber);
}

function updateGroupRooms(
  groups: RoomGroup[],
  groupId: string,
  updater: (rooms: RoomUnit[]) => RoomUnit[],
) {
  return groups.map((group) =>
    group.id === groupId ? { ...group, rooms: updater(group.rooms) } : group,
  );
}

export function RoomPlanningBoard({
  snapshot,
  searchQuery,
  language,
  locale,
  onNotify,
}: RoomPlanningBoardProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StayStatus | "all">("all");
  const [selectedStayId, setSelectedStayId] = useState(ROOM_STAYS[0].id);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [manageRooms, setManageRooms] = useState(false);
  const [roomGroups, setRoomGroups] = useState<RoomGroup[]>(() => DEFAULT_ROOM_GROUPS);
  const [draggedRoom, setDraggedRoom] = useState<DraggedRoom | null>(null);
  const [dropTarget, setDropTarget] = useState<RoomDropTarget | null>(null);
  const draggedRoomRef = useRef<DraggedRoom | null>(null);
  const dropTargetRef = useRef<RoomDropTarget | null>(null);
  const isEnglish = language === "en";
  const normalizedSearch = localSearch.trim().toLowerCase();
  const days = useMemo(() => buildDays(monthOffset, language), [language, monthOffset]);
  const roomById = useMemo(
    () =>
      new Map(
        roomGroups.flatMap((group) =>
          group.rooms.map((room) => [room.id, { ...room, groupLabel: group.label }]),
        ),
      ),
    [roomGroups],
  );

  const visibleGroups = useMemo(() => {
    return roomGroups.map((group) => {
      const rooms = group.rooms.filter((room) => {
        const roomStays = ROOM_STAYS.filter((stay) => stay.roomId === room.id);
        const hasStatus =
          manageRooms ||
          statusFilter === "all" ||
          roomStays.some((stay) => stay.status === statusFilter);

        if (!hasStatus) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return (
          room.label.toLowerCase().includes(normalizedSearch) ||
          group.label.toLowerCase().includes(normalizedSearch) ||
          roomStays.some((stay) =>
            `${stay.guest} ${stay.source} ${stay.board} ${STATUS_LABELS[language][stay.status]}`
              .toLowerCase()
              .includes(normalizedSearch),
          )
        );
      });

      return { ...group, rooms };
    }).filter((group) => manageRooms || group.rooms.length > 0);
  }, [language, manageRooms, normalizedSearch, roomGroups, statusFilter]);

  const visibleStays = useMemo(() => {
    const visibleRoomIds = new Set(visibleGroups.flatMap((group) => group.rooms.map((room) => room.id)));
    return ROOM_STAYS.filter(
      (stay) =>
        visibleRoomIds.has(stay.roomId) &&
        (statusFilter === "all" || stay.status === statusFilter),
    );
  }, [statusFilter, visibleGroups]);

  const selectedStay =
    visibleStays.find((stay) => stay.id === selectedStayId) ?? visibleStays[0] ?? ROOM_STAYS[0];
  const selectedRoom = roomById.get(selectedStay.roomId);
  const arrivals = ROOM_STAYS.filter((stay) => stay.startDay === 12 && stay.status !== "maintenance").length;
  const departures = ROOM_STAYS.filter((stay) => stay.endDay === 12 && stay.status !== "maintenance").length;
  const inHouse = ROOM_STAYS.filter(
    (stay) => stay.status !== "maintenance" && stayOverlapsDay(stay, 12),
  ).length;
  const blocked = ROOM_STAYS.filter((stay) => stay.status === "maintenance").length;
  const totalRooms = roomGroups.reduce((total, group) => total + group.rooms.length, 0);
  const monthTitle = getMonthTitle(monthOffset, locale);

  function handleUtilityAction(label: string) {
    onNotify("info", isEnglish ? `${label} queued for the rooms board.` : `${label} preparato per il planning camere.`);
  }

  function addRoomGroup() {
    const newGroup: RoomGroup = {
      id: createEditableId("room-group"),
      label: isEnglish ? "New type" : "Nuova tipologia",
      rooms: [],
    };

    setManageRooms(true);
    setRoomGroups((current) => [...current, newGroup]);
    onNotify("success", isEnglish ? "Room type added." : "Tipologia camera aggiunta.");
  }

  function removeRoomGroup(group: RoomGroup) {
    if (roomGroups.length <= 1) {
      onNotify(
        "warning",
        isEnglish ? "At least one room type is required." : "Deve restare almeno una tipologia camera.",
      );
      return;
    }

    setRoomGroups((current) => current.filter((entry) => entry.id !== group.id));
    onNotify(
      "info",
      isEnglish
        ? `${group.label} removed with ${group.rooms.length} rooms.`
        : `${group.label} rimossa con ${group.rooms.length} camere.`,
    );
  }

  function updateRoomGroupLabel(groupId: string, label: string) {
    setRoomGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, label: label || (isEnglish ? "Untitled type" : "Tipologia senza nome") } : group,
      ),
    );
  }

  function addRoom(groupId: string) {
    setManageRooms(true);
    setRoomGroups((current) =>
      updateGroupRooms(current, groupId, (rooms) => [
        ...rooms,
        {
          id: createEditableId("room"),
          label: getNextRoomLabel(current),
        },
      ]),
    );
    onNotify("success", isEnglish ? "Room added." : "Camera aggiunta.");
  }

  function updateRoomLabel(roomId: string, label: string) {
    setRoomGroups((current) =>
      current.map((group) => ({
        ...group,
        rooms: group.rooms.map((room) =>
          room.id === roomId ? { ...room, label: label || (isEnglish ? "Untitled room" : "Camera senza nome") } : room,
        ),
      })),
    );
  }

  function removeRoom(groupId: string, room: RoomUnit) {
    setRoomGroups((current) =>
      updateGroupRooms(current, groupId, (rooms) => rooms.filter((entry) => entry.id !== room.id)),
    );
    onNotify("info", isEnglish ? `Room ${room.label} removed.` : `Camera ${room.label} rimossa.`);
  }

  function moveRoom(sourceGroupId: string, roomId: string, targetGroupId: string, targetRoomId?: string) {
    setRoomGroups((current) => {
      let movedRoom: RoomUnit | null = null;
      const withoutMovedRoom = current.map((group) => {
        if (group.id !== sourceGroupId) {
          return group;
        }

        movedRoom = group.rooms.find((room) => room.id === roomId) ?? null;
        return {
          ...group,
          rooms: group.rooms.filter((room) => room.id !== roomId),
        };
      });

      if (!movedRoom) {
        return current;
      }

      return withoutMovedRoom.map((group) => {
        if (group.id !== targetGroupId) {
          return group;
        }

        const insertIndex = targetRoomId
          ? group.rooms.findIndex((room) => room.id === targetRoomId)
          : group.rooms.length;
        const safeInsertIndex = insertIndex < 0 ? group.rooms.length : insertIndex;
        const nextRooms = [...group.rooms];
        nextRooms.splice(safeInsertIndex, 0, movedRoom as RoomUnit);

        return {
          ...group,
          rooms: nextRooms,
        };
      });
    });
  }

  function handleRoomDragStart(groupId: string, roomId: string, event: DragEvent<HTMLElement>) {
    const nextDraggedRoom = { sourceGroupId: groupId, roomId };
    draggedRoomRef.current = nextDraggedRoom;
    setDraggedRoom(nextDraggedRoom);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roomId);
  }

  function clearDraggedRoom() {
    draggedRoomRef.current = null;
    dropTargetRef.current = null;
    setDraggedRoom(null);
    setDropTarget(null);
  }

  function handleRoomDrop(targetGroupId: string, targetRoomId?: string, event?: DragEvent<HTMLElement>) {
    event?.preventDefault();
    const currentDraggedRoom = draggedRoomRef.current ?? draggedRoom;

    if (!currentDraggedRoom) {
      return;
    }

    moveRoom(currentDraggedRoom.sourceGroupId, currentDraggedRoom.roomId, targetGroupId, targetRoomId);
    clearDraggedRoom();
  }

  function handleRoomPointerDragStart(groupId: string, roomId: string) {
    const nextDraggedRoom = { sourceGroupId: groupId, roomId };
    draggedRoomRef.current = nextDraggedRoom;
    setDraggedRoom(nextDraggedRoom);
  }

  function markRoomDropTarget(groupId: string, targetRoomId?: string) {
    if (!draggedRoomRef.current) {
      return;
    }

    const nextDropTarget = { groupId, targetRoomId };
    dropTargetRef.current = nextDropTarget;
    setDropTarget(nextDropTarget);
  }

  function isMarkedDropTarget(groupId: string, targetRoomId?: string) {
    return dropTarget?.groupId === groupId && dropTarget.targetRoomId === targetRoomId;
  }

  useEffect(() => {
    function handlePointerUp(event: PointerEvent) {
      const currentDraggedRoom = draggedRoomRef.current;
      const elementUnderPointer = document.elementFromPoint(event.clientX, event.clientY);
      const roomTarget = elementUnderPointer?.closest<HTMLElement>(".rooms-room-label[data-room-id]");
      const groupTarget = elementUnderPointer?.closest<HTMLElement>(
        ".rooms-group-label[data-room-group-id], .rooms-type-drop-target[data-room-group-id]",
      );
      const pointerDropTarget =
        roomTarget?.dataset.roomGroupId
          ? {
              groupId: roomTarget.dataset.roomGroupId,
              targetRoomId: roomTarget.dataset.roomId,
            }
          : groupTarget?.dataset.roomGroupId
            ? { groupId: groupTarget.dataset.roomGroupId }
            : null;
      const currentDropTarget = pointerDropTarget ?? dropTargetRef.current;

      if (currentDraggedRoom && currentDropTarget) {
        moveRoom(
          currentDraggedRoom.sourceGroupId,
          currentDraggedRoom.roomId,
          currentDropTarget.groupId,
          currentDropTarget.targetRoomId,
        );
      }

      if (currentDraggedRoom) {
        clearDraggedRoom();
      }
    }

    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });

  return (
    <section className="rooms-planning-page">
      <header className="rooms-planning-header">
        <div className="min-w-0">
          <div className="rooms-planning-kicker">
            <CalendarDays className="h-4 w-4" />
            <span>{snapshot.tenant.businessName}</span>
          </div>
          <div className="rooms-planning-title-row">
            <h1>{isEnglish ? "Rooms planning" : "Planning camere"}</h1>
            <button
              type="button"
              className="rooms-month-button"
              onClick={() => setMonthOffset(0)}
            >
              {monthTitle}
            </button>
          </div>
        </div>

        <div className="rooms-header-actions">
          <label className="rooms-search-field">
            <Search className="h-4 w-4" />
            <input
              type="search"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={isEnglish ? "Search guest or room" : "Cerca ospite o camera"}
            />
          </label>
          <button type="button" className="rooms-icon-button" onClick={() => setMonthOffset((current) => current - 1)} aria-label={isEnglish ? "Previous month" : "Mese precedente"}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="rooms-icon-button" onClick={() => setMonthOffset((current) => current + 1)} aria-label={isEnglish ? "Next month" : "Mese successivo"}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" className="rooms-icon-button" onClick={() => handleUtilityAction(isEnglish ? "Print" : "Stampa")} aria-label={isEnglish ? "Print" : "Stampa"}>
            <Printer className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={manageRooms ? "rooms-manage-button active" : "rooms-manage-button"}
            onClick={() => setManageRooms((current) => !current)}
            aria-pressed={manageRooms}
          >
            {manageRooms ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            <span>
              {manageRooms
                ? isEnglish
                  ? "Done editing"
                  : "Fine modifica"
                : isEnglish
                  ? "Edit rooms"
                  : "Modifica camere"}
            </span>
          </button>
          <button type="button" className="rooms-primary-button" onClick={() => handleUtilityAction(isEnglish ? "New stay" : "Nuovo soggiorno")}>
            <Plus className="h-4 w-4" />
            <span>{isEnglish ? "New stay" : "Nuovo"}</span>
          </button>
        </div>
      </header>

      <div className="rooms-planning-strip">
        <div className="rooms-stat">
          <span>{isEnglish ? "In house" : "In casa"}</span>
          <strong>{inHouse}</strong>
        </div>
        <div className="rooms-stat">
          <span>{isEnglish ? "Arrivals" : "Arrivi"}</span>
          <strong>{arrivals}</strong>
        </div>
        <div className="rooms-stat">
          <span>{isEnglish ? "Departures" : "Partenze"}</span>
          <strong>{departures}</strong>
        </div>
        <div className="rooms-stat">
          <span>{isEnglish ? "Blocked" : "Blocchi"}</span>
          <strong>{blocked}</strong>
        </div>
        <div className="rooms-status-filter" role="group" aria-label={isEnglish ? "Stay status" : "Stato soggiorno"}>
          {(["all", "confirmed", "checked_in", "option", "maintenance"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "active" : ""}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? (isEnglish ? "All" : "Tutte") : STATUS_LABELS[language][status]}
            </button>
          ))}
        </div>
      </div>

      {manageRooms ? (
        <div className="rooms-management-strip">
          <div className="rooms-management-summary">
            <strong>{totalRooms}</strong>
            <span>{isEnglish ? "editable rooms" : "camere modificabili"}</span>
          </div>
          <div className="rooms-type-drop-list">
            {roomGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={[
                  "rooms-type-drop-target",
                  isMarkedDropTarget(group.id) ? "drop-target" : "",
                ].join(" ")}
                data-room-group-id={group.id}
                onPointerEnter={() => markRoomDropTarget(group.id)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => handleRoomDrop(group.id, undefined, event)}
              >
                <span>{group.label}</span>
                <strong>{group.rooms.length}</strong>
              </button>
            ))}
          </div>
          <button type="button" className="rooms-secondary-button" onClick={addRoomGroup}>
            <Plus className="h-4 w-4" />
            <span>{isEnglish ? "Room type" : "Tipologia"}</span>
          </button>
        </div>
      ) : null}

      <div
        className={manageRooms ? "rooms-board-shell managing" : "rooms-board-shell"}
        style={
          {
            "--rooms-day-count": days.length,
          } as CSSProperties
        }
      >
        <div className="rooms-board-scroll">
          <div className="rooms-calendar-head">
            <div className={manageRooms ? "rooms-room-head managing" : "rooms-room-head"}>
              <span>{isEnglish ? "Room" : "Camera"}</span>
              {manageRooms ? (
                <div className="rooms-room-head-actions">
                  <span className="rooms-room-head-mode">
                    {isEnglish ? "editing" : "modifica"}
                  </span>
                  <button
                    type="button"
                    className="rooms-room-head-action"
                    onClick={addRoomGroup}
                    title={isEnglish ? "Add room type" : "Aggiungi tipologia camera"}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
            {days.map((day) => (
              <div key={day.day} className={day.weekend ? "rooms-day-head weekend" : "rooms-day-head"}>
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
              </div>
            ))}
          </div>

          {visibleGroups.length === 0 ? (
            <div className="rooms-empty-state">
              {isEnglish ? "No rooms match the current filters." : "Nessuna camera corrisponde ai filtri correnti."}
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.id} className="rooms-group">
                <div className="rooms-group-row">
                  <div
                    className={[
                      "rooms-group-label",
                      manageRooms ? "editing" : "",
                      isMarkedDropTarget(group.id) ? "drop-target" : "",
                    ].join(" ")}
                    data-room-group-id={group.id}
                    onPointerEnter={
                      manageRooms ? () => markRoomDropTarget(group.id) : undefined
                    }
                    onDragOver={
                      manageRooms
                        ? (event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }
                        : undefined
                    }
                    onDrop={
                      manageRooms
                        ? (event) => handleRoomDrop(group.id, undefined, event)
                        : undefined
                    }
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {manageRooms ? (
                      <>
                        <input
                          className="rooms-inline-input"
                          value={group.label}
                          onChange={(event) => updateRoomGroupLabel(group.id, event.target.value)}
                          aria-label={isEnglish ? "Room type name" : "Nome tipologia camera"}
                        />
                        <button
                          type="button"
                          className="rooms-row-action"
                          onClick={() => addRoom(group.id)}
                          aria-label={isEnglish ? `Add room to ${group.label}` : `Aggiungi camera a ${group.label}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rooms-row-action danger"
                          onClick={() => removeRoomGroup(group)}
                          aria-label={isEnglish ? `Remove ${group.label}` : `Rimuovi ${group.label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span>{group.label}</span>
                    )}
                  </div>
                  {days.map((day) => (
                    <div key={`${group.id}-${day.day}`} className={day.weekend ? "rooms-group-load weekend" : "rooms-group-load"}>
                      {getGroupOccupancy(group, day.day)}/{group.rooms.length}
                    </div>
                  ))}
                </div>

                {group.rooms.map((room) => {
                  const roomStays = visibleStays
                    .filter((stay) => stay.roomId === room.id)
                    .map(clampStay);

                  return (
                    <div key={room.id} className="rooms-room-row">
                      <div
                        className={[
                          "rooms-room-label",
                          manageRooms ? "editing" : "",
                          isMarkedDropTarget(group.id, room.id) ? "drop-target" : "",
                          draggedRoom?.roomId === room.id ? "dragging" : "",
                        ].join(" ")}
                        data-room-id={room.id}
                        data-room-group-id={group.id}
                        onPointerEnter={
                          manageRooms ? () => markRoomDropTarget(group.id, room.id) : undefined
                        }
                        onDragOver={
                          manageRooms
                            ? (event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }
                            : undefined
                        }
                        onDrop={
                          manageRooms
                            ? (event) => handleRoomDrop(group.id, room.id, event)
                            : undefined
                        }
                      >
                        {manageRooms ? (
                          <>
                            <span
                              className="rooms-drag-handle"
                              draggable
                              onPointerDown={() => handleRoomPointerDragStart(group.id, room.id)}
                              onDragStart={(event) => handleRoomDragStart(group.id, room.id, event)}
                              onDragEnd={clearDraggedRoom}
                              title={isEnglish ? "Drag room" : "Trascina camera"}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <input
                              className="rooms-inline-input"
                              value={room.label}
                              onChange={(event) => updateRoomLabel(room.id, event.target.value)}
                              aria-label={isEnglish ? "Room number or name" : "Numero o nome camera"}
                            />
                            <select
                              className="rooms-type-select"
                              value={group.id}
                              onChange={(event) => moveRoom(group.id, room.id, event.target.value)}
                              aria-label={isEnglish ? "Room type" : "Tipologia camera"}
                            >
                              {roomGroups.map((roomGroup) => (
                                <option key={roomGroup.id} value={roomGroup.id}>
                                  {roomGroup.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="rooms-row-action danger"
                              onClick={() => removeRoom(group.id, room)}
                              aria-label={isEnglish ? `Remove room ${room.label}` : `Rimuovi camera ${room.label}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          room.label
                        )}
                      </div>
                      <div className="rooms-room-days">
                        {days.map((day) => (
                          <div key={day.day} className={day.weekend ? "rooms-day-cell weekend" : "rooms-day-cell"} />
                        ))}
                        {roomStays.map((stay) => (
                          <button
                            key={stay.id}
                            type="button"
                            className={[
                              "rooms-stay",
                              `tone-${stay.tone}`,
                              selectedStay.id === stay.id ? "selected" : "",
                            ].join(" ")}
                            style={{ gridColumn: `${stay.startDay} / ${stay.endDay}` }}
                            onClick={() => setSelectedStayId(stay.id)}
                            title={`${stay.guest} · ${STATUS_LABELS[language][stay.status]}`}
                          >
                            {stay.status === "maintenance" ? <Lock className="h-3 w-3" /> : null}
                            <span>{stay.guest}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="rooms-selected-panel">
        <div className="rooms-selected-main">
          <span className={`rooms-selected-dot tone-${selectedStay.tone}`} />
          <div>
            <strong>{selectedStay.guest}</strong>
            <span>
              {selectedRoom?.label ?? selectedStay.roomId} · {selectedStay.startDay}/{selectedStay.endDay - 1} {monthTitle}
            </span>
          </div>
        </div>
        <div className="rooms-selected-meta">
          <StatusBadge
            status={STATUS_LABELS[language][selectedStay.status]}
            variant={getStatusBadgeVariant(selectedStay.status)}
          />
          <span>{selectedStay.guests} pax</span>
          <span>{selectedStay.board}</span>
          <span>{selectedStay.source}</span>
        </div>
      </footer>
    </section>
  );
}
