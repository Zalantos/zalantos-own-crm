import {
  Building2Icon,
  CheckSquareIcon,
  ClipboardListIcon,
  HistoryIcon,
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
  VideoIcon,
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
};

export const HOME_ITEM: NavItem = {
  href: "/dashboard",
  label: "Inicio",
  icon: LayoutDashboardIcon,
};

export const CRM_SECTION: NavSection = {
  label: "CRM",
  items: [
    { href: "/companies", label: "Empresas", icon: Building2Icon },
    { href: "/people", label: "Personas", icon: UsersIcon },
    { href: "/opportunities", label: "Oportunidades", icon: KanbanSquareIcon },
    { href: "/activities", label: "Actividades", icon: CheckSquareIcon },
    { href: "/meetings", label: "Meeting Intelligence", icon: VideoIcon },
    {
      href: "/agent/proposals",
      label: "Propuestas del agente",
      icon: ClipboardListIcon,
    },
    { href: "/audit-log", label: "Actividad", icon: HistoryIcon },
  ],
};

export const ADMIN_SECTION: NavSection = {
  label: "Configuración",
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
      href: "/admin/settings/telegram",
      label: "Telegram",
      icon: SendIcon,
    },
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
  items: [{ href: "/superadmin", label: "Organizaciones", icon: ShieldIcon }],
};

// Los 4 accesos de mayor frecuencia de uso para la barra inferior de mobile;
// el resto de las secciones queda detrás del botón "Más".
export const BOTTOM_NAV_PRIMARY_ITEMS: NavItem[] = [
  HOME_ITEM,
  CRM_SECTION.items[0],
  CRM_SECTION.items[1],
  CRM_SECTION.items[2],
];

export const BOTTOM_NAV_MORE_ITEMS: NavItem[] = CRM_SECTION.items.slice(3);
