import {
  BellRingIcon,
  Building2Icon,
  CalendarDaysIcon,
  CableIcon,
  ChartColumnIcon,
  CompassIcon,
  HandshakeIcon,
  MegaphoneIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  HistoryIcon,
  InboxIcon,
  KanbanSquareIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserCogIcon,
  UsersIcon,
  UsersRoundIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavSection = {
  label: string;
  items: NavItem[];
  // Cerrada al cargar el sidebar; se abre solo si el usuario pulsa el título.
  startCollapsed?: boolean;
};

export const HOME_ITEM: NavItem = {
  href: "/dashboard",
  label: "Inicio",
  icon: LayoutDashboardIcon,
};

export const CRM_SECTION: NavSection = {
  label: "CRM",
  items: [
    { href: "/prospecting", label: "Prospección", icon: CompassIcon },
    { href: "/opportunities", label: "Oportunidades", icon: KanbanSquareIcon },
    { href: "/partners", label: "Partners", icon: HandshakeIcon },
    { href: "/activities", label: "Actividades", icon: CheckSquareIcon },
    { href: "/leads", label: "Leads entrantes", icon: InboxIcon },
    { href: "/analytics", label: "Analítica comercial", icon: ChartColumnIcon },
    { href: "/companies", label: "Empresas", icon: Building2Icon },
    { href: "/people", label: "Personas", icon: UsersIcon },
    {
      href: "/agent/proposals",
      label: "Actividad de IA",
      icon: ClipboardListIcon,
    },
    {
      href: "/audit-log",
      label: "Historial de Actividades",
      icon: HistoryIcon,
    },
  ],
};

export const ADMIN_SECTION: NavSection = {
  label: "Configuración",
  startCollapsed: true,
  items: [
    { href: "/admin/users", label: "Usuarios", icon: UserCogIcon },
    { href: "/admin/team", label: "Equipo", icon: UsersRoundIcon },
    {
      href: "/admin/custom-fields",
      label: "Campos custom",
      icon: SlidersHorizontalIcon,
    },
    { href: "/admin/workflows", label: "Workflows", icon: WorkflowIcon },
    {
      href: "/admin/settings/stages",
      label: "Etapas del pipeline",
      icon: ListOrderedIcon,
    },
    {
      href: "/admin/settings/alerts",
      label: "Alertas por etapa",
      icon: BellRingIcon,
    },
    {
      href: "/admin/settings/campaigns",
      label: "Campañas",
      icon: MegaphoneIcon,
    },
    {
      href: "/admin/settings/holidays",
      label: "Feriados comerciales",
      icon: CalendarDaysIcon,
    },
    {
      href: "/admin/settings/telegram",
      label: "Telegram",
      icon: SendIcon,
    },
    { href: "/admin/settings/mcp", label: "MCP", icon: CableIcon },
    {
      href: "/admin/settings/general",
      label: "Organización",
      icon: SettingsIcon,
    },
  ],
};

// Panel de plataforma (crear/administrar organizaciones) — solo super-admins.
export const SUPERADMIN_SECTION: NavSection = {
  label: "Plataforma",
  startCollapsed: true,
  items: [{ href: "/superadmin", label: "Organizaciones", icon: ShieldIcon }],
};

// Los 4 accesos de mayor frecuencia de uso para la barra inferior de mobile;
// el resto de las secciones queda detrás del botón "Más".
const BOTTOM_NAV_PRIMARY_HREFS = ["/prospecting", "/opportunities", "/activities"];

export const BOTTOM_NAV_PRIMARY_ITEMS: NavItem[] = [
  HOME_ITEM,
  ...CRM_SECTION.items.filter((item) =>
    BOTTOM_NAV_PRIMARY_HREFS.includes(item.href),
  ),
];

export const BOTTOM_NAV_MORE_ITEMS: NavItem[] = CRM_SECTION.items.filter(
  (item) => !BOTTOM_NAV_PRIMARY_HREFS.includes(item.href),
);
