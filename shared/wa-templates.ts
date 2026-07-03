// ============================================
// WhatsApp message templates — shared metadata + defaults.
//
// This module is the single source of truth for:
//   * the queue modes the WhatsApp content manager exposes
//   * the trigger points within each mode
//   * the variable names each mode supports
//   * the English default body for every (mode, trigger) pair
//   * a small set of localized defaults for representative triggers
//
// Both the Super Admin web UI (which previously inlined these defaults)
// and the server-side notification pipeline read from here, so any change
// to a default or a new trigger only needs to land in one place.
// ============================================

export type WaMode = "fifo" | "selective" | "multistage" | "checkin" | "dinein" | "takeaway" | "events";

export interface WaModeMeta {
  id: WaMode;
  label: string;
  icon: string;
}

export interface WaLanguageMeta {
  code: string;
  label: string;
  flag: string;
}

export interface WaTriggerMeta {
  key: string;
  label: string;
}

export const WA_MODES: WaModeMeta[] = [
  { id: "fifo",       label: "FIFO",        icon: "fa-solid fa-arrow-right-arrow-left" },
  { id: "selective",  label: "Selective",   icon: "fa-solid fa-list-check" },
  { id: "multistage", label: "Multi Stage", icon: "fa-solid fa-layer-group" },
  { id: "checkin",    label: "Check In",    icon: "fa-regular fa-calendar-check" },
  { id: "dinein",     label: "Dine In",     icon: "fa-solid fa-utensils" },
  { id: "takeaway",   label: "Takeaway",    icon: "fa-solid fa-bag-shopping" },
  { id: "events",     label: "Events",      icon: "fa-solid fa-ticket" },
];

export const WA_LANGUAGES: WaLanguageMeta[] = [
  { code: "en", label: "English", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
  { code: "ar", label: "العربية", flag: "\uD83C\uDDE6\uD83C\uDDEA" },
  { code: "es", label: "Español", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "fr", label: "Français", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "hi", label: "हिन्दी", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "ta", label: "தமிழ்", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "zh", label: "中文",   flag: "\uD83C\uDDE8\uD83C\uDDF3" },
];

export const WA_TRIGGERS: Record<WaMode, WaTriggerMeta[]> = {
  fifo: [
    { key: "joined",      label: "Ticket Issued" },
    { key: "position",    label: "Position Update" },
    { key: "get_ready",   label: "Get Ready" },
    { key: "almost",      label: "Almost Your Turn" },
    { key: "now_serving", label: "Now Serving" },
    { key: "no_show",     label: "No-show / Missed" },
    { key: "completed",   label: "Service Completed" },
  ],
  selective: [
    { key: "service_selected", label: "Service Selected" },
    { key: "joined",           label: "Ticket Issued" },
    { key: "position",         label: "Position Update" },
    { key: "now_serving",      label: "Now Serving" },
    { key: "completed",        label: "Service Completed" },
    { key: "cancelled",        label: "Ticket Cancelled" },
  ],
  multistage: [
    { key: "journey_started",   label: "Journey Started" },
    { key: "stage_complete",    label: "Stage Completed" },
    { key: "next_stage_ready",  label: "Next Stage Ready" },
    { key: "now_serving",       label: "Now Serving · Current Stage" },
    { key: "delayed",           label: "Stage Delayed" },
    { key: "journey_complete",  label: "All Stages Completed" },
  ],
  checkin: [
    { key: "confirmed",   label: "Booking Confirmed" },
    { key: "reminder_24", label: "Reminder · 24 hours before" },
    { key: "reminder_1",  label: "Reminder · 1 hour before" },
    { key: "checked_in",  label: "Checked In" },
    { key: "now_serving", label: "Now Serving" },
    { key: "cancelled",   label: "Booking Cancelled" },
    { key: "rescheduled", label: "Booking Rescheduled" },
  ],
  dinein: [
    { key: "confirmed",   label: "Booking Confirmed" },
    { key: "reminder",    label: "Booking Reminder" },
    { key: "hold",        label: "Booking on Hold" },
    { key: "table_ready", label: "Table Ready" },
    { key: "wait_update", label: "Wait Time Update" },
    { key: "reservation", label: "Reservation Confirm" },
    { key: "resume",      label: "Booking Resumed" },
  ],
  takeaway: [
    { key: "received",   label: "Order Received" },
    { key: "confirmed",  label: "Order Confirmed" },
    { key: "preparing",  label: "Order Being Prepared" },
    { key: "ready",      label: "Order Ready" },
    { key: "delivered",  label: "Order Delivered" },
    { key: "call_again", label: "Call Again Reminder" },
  ],
  events: [
    { key: "ticket",             label: "Ticket / Boarding Pass" },
    { key: "reminder_day",       label: "Reminder · Day Before" },
    { key: "reminder_hour",      label: "Reminder · 1 Hour Before" },
    { key: "slot_active",        label: "Slot Active · Come Now" },
    { key: "arrived",            label: "Arrival Confirmed" },
    { key: "checked_in",         label: "Checked In · Welcome" },
    { key: "thank_you_feedback", label: "Thank You + Feedback" },
  ],
};

export const WA_VARIABLES: Record<WaMode, string[]> = {
  fifo:       ["customer_name", "ticket_number", "service_name", "branch_name", "queue_position", "wait_time", "counter_no"],
  selective:  ["customer_name", "ticket_number", "service_name", "staff_name", "branch_name", "queue_position", "wait_time", "counter_no"],
  multistage: ["customer_name", "ticket_number", "service_name", "branch_name", "stage_name", "stage_number", "next_stage", "queue_position", "wait_time", "counter_no"],
  checkin:    ["customer_name", "booking_id", "service_name", "branch_name", "appointment_time", "appointment_date", "staff_name", "counter_no"],
  dinein:     ["customer_name", "branch_name", "restaurant_name", "booking_id", "table_no", "guest_count", "wait_time", "reservation_time"],
  takeaway:   ["customer_name", "order_id", "branch_name", "foodcourt_name", "ready_time", "pickup_counter"],
  events:     ["customer_name", "event_name", "booking_id", "slot_date", "slot_time", "venue", "family_count", "amount_paid", "support_contact", "feedback_link", "maps_link"],
};

export const WA_SAMPLE_DATA: Record<string, string> = {
  customer_name: "Sara Ahmed", ticket_number: "A-042", service_name: "Cardiology",
  branch_name: "Downtown Branch", queue_position: "3", wait_time: "12",
  counter_no: "Counter 5", booking_id: "BK-29481", appointment_time: "10:30 AM",
  appointment_date: "Apr 26, 2026", staff_name: "Dr. Khan",
  stage_name: "Diagnostics", stage_number: "2", next_stage: "Consultation",
  restaurant_name: "The Olive Tree", table_no: "T-08", guest_count: "4",
  reservation_time: "7:30 PM", order_id: "1042", foodcourt_name: "Marina Mall Foodcourt",
  ready_time: "5 min", pickup_counter: "Counter 3",
  event_name: "Spring Expo 2026", slot_date: "Apr 26, 2026", slot_time: "10:30 AM",
  venue: "City Convention Center", family_count: "3", amount_paid: "₹500",
  support_contact: "+91 98765 43210", feedback_link: "https://example.com/feedback",
  maps_link: "https://maps.google.com/?q=venue",
};

// English defaults — keyed as `${mode}|${trigger}`. Other languages start as
// English and can be overridden per language; see WA_DEFAULTS_LOCALIZED below.
export const WA_DEFAULTS_EN: Record<string, string> = {
  "fifo|joined":      "\uD83C\uDFAB *Ticket Issued!* Hello {{customer_name}}, your ticket number is *{{ticket_number}}* for {{service_name}} at {{branch_name}}. You are currently at position *{{queue_position}}* with an estimated wait of {{wait_time}} minutes.",
  "fifo|position":    "\u23F3 Hi {{customer_name}}, your queue position is now *{{queue_position}}*. Estimated wait: {{wait_time}} minutes. Ticket: *{{ticket_number}}*",
  "fifo|get_ready":   "\u23F0 *Get ready, {{customer_name}}!* Your turn for {{service_name}} at {{branch_name}} is coming up soon — you are at position *{{queue_position}}*. Please start making your way over. Ticket *{{ticket_number}}*.",
  "fifo|almost":      "\u26A1 *Almost your turn!* {{customer_name}}, you are next in line for {{service_name}}. Please make your way to {{branch_name}}. Ticket *{{ticket_number}}*.",
  "fifo|now_serving": "\u2705 *Now Serving:* Ticket *{{ticket_number}}* — please proceed to *{{counter_no}}* at {{branch_name}}. Welcome, {{customer_name}}!",
  "fifo|no_show":     "\uD83D\uDE14 We missed you, {{customer_name}}. Your ticket *{{ticket_number}}* at {{branch_name}} was marked as no-show. Reply to rejoin the queue.",
  "fifo|completed":   "\uD83D\uDE4F Thank you {{customer_name}}! Your visit at {{branch_name}} is complete. We hope to see you again soon.",

  "selective|service_selected": "\u2705 Got it, {{customer_name}}! You selected *{{service_name}}* with *{{staff_name}}* at {{branch_name}}. Confirm to receive your queue ticket.",
  "selective|joined":           "\uD83C\uDFAB *Ticket Issued!* Hello {{customer_name}}, your ticket *{{ticket_number}}* for {{service_name}} ({{staff_name}}) at {{branch_name}} is ready. Position: *{{queue_position}}* — wait: {{wait_time}} min.",
  "selective|position":         "\u23F3 Hi {{customer_name}}, your queue position for {{staff_name}} is now *{{queue_position}}*. Estimated wait: {{wait_time}} minutes. Ticket *{{ticket_number}}*.",
  "selective|now_serving":      "\u2705 *Now Serving:* Ticket *{{ticket_number}}* — please proceed to {{counter_no}} to meet {{staff_name}} at {{branch_name}}.",
  "selective|completed":        "\uD83D\uDE4F Thank you {{customer_name}}! Your appointment with {{staff_name}} at {{branch_name}} is complete.",
  "selective|cancelled":        "\u274C {{customer_name}}, your ticket *{{ticket_number}}* for {{staff_name}} at {{branch_name}} was cancelled. Reply to rejoin the queue.",

  "multistage|journey_started":  "\uD83D\uDE80 *Journey started!* Hello {{customer_name}}, your service journey for *{{service_name}}* at {{branch_name}} has begun. First stage: *{{stage_name}}*. Ticket: *{{ticket_number}}*",
  "multistage|stage_complete":   "\u2705 *Stage {{stage_number}} complete!* {{customer_name}}, you completed *{{stage_name}}*. Next up: *{{next_stage}}*. Estimated wait: {{wait_time}} min.",
  "multistage|next_stage_ready": "\u26A1 *Next stage ready:* {{customer_name}}, please proceed to *{{stage_name}}* — {{counter_no}} at {{branch_name}}. Ticket *{{ticket_number}}*.",
  "multistage|now_serving":      "\uD83D\uDD14 *Now Serving:* Ticket *{{ticket_number}}* at *{{stage_name}}* — please proceed to {{counter_no}}, {{branch_name}}.",
  "multistage|delayed":          "\u231B Update: {{customer_name}}, *{{stage_name}}* is taking a bit longer. New estimated wait: *{{wait_time}}* min. Thank you for your patience!",
  "multistage|journey_complete": "\uD83C\uDF89 *All stages complete!* Thank you {{customer_name}} — your journey for {{service_name}} at {{branch_name}} is complete.",

  "checkin|confirmed":   "\uD83D\uDCC5 *Booking Confirmed!* {{customer_name}}, your appointment for {{service_name}} with {{staff_name}} at {{branch_name}} is set for *{{appointment_date}} at {{appointment_time}}*. Booking ID: *{{booking_id}}*",
  "checkin|reminder_24": "\uD83D\uDD14 *Reminder:* {{customer_name}}, your appointment at {{branch_name}} is tomorrow ({{appointment_date}}) at *{{appointment_time}}*. Booking ID: *{{booking_id}}*",
  "checkin|reminder_1":  "\u23F0 *In 1 hour:* {{customer_name}}, your appointment with {{staff_name}} is at {{appointment_time}}. Please arrive 10 min early. Booking ID: *{{booking_id}}*",
  "checkin|checked_in":  "\u2705 *Checked in!* {{customer_name}}, you are checked in for your *{{appointment_time}}* appointment at {{branch_name}}. We will call you shortly.",
  "checkin|now_serving": "\uD83D\uDD14 *It\u2019s your turn!* {{customer_name}}, please proceed to {{staff_name}} at {{branch_name}} ({{counter_no}}).",
  "checkin|cancelled":   "\u274C {{customer_name}}, your booking *{{booking_id}}* at {{branch_name}} has been cancelled. Reply to rebook.",
  "checkin|rescheduled": "\uD83D\uDCC5 {{customer_name}}, your booking *{{booking_id}}* has been rescheduled to *{{appointment_date}} at {{appointment_time}}* at {{branch_name}}.",

  "dinein|confirmed":   "\uD83C\uDF7D\uFE0F *Table booking confirmed!* Restaurant: *{{restaurant_name}}* · Booking ID: *{{booking_id}}* · Guests: *{{guest_count}}* · Time: *{{reservation_time}}*. See you soon, {{customer_name}}!",
  "dinein|reminder":    "\uD83D\uDD14 *Reminder!* {{customer_name}}, your table at *{{restaurant_name}}* is ready! Table: *{{table_no}}* · Guests: *{{guest_count}}* · Booking ID: *{{booking_id}}*. Please arrive on time.",
  "dinein|hold":        "\u23F8\uFE0F *Booking on Hold.* Hello {{customer_name}}, your booking *{{booking_id}}* is on hold. Please contact the front desk to resume your booking.",
  "dinein|table_ready": "\u2705 *Table Ready!* Your table at *{{branch_name}}* is ready! Table: *{{table_no}}* · Guests: *{{guest_count}}* · Booking ID: *{{booking_id}}*. Please proceed to the host.",
  "dinein|wait_update": "\u23F3 Update: {{customer_name}}, your estimated wait time at {{branch_name}} is approximately *{{wait_time}}* minutes. Thank you for your patience!",
  "dinein|reservation": "\uD83D\uDD14 *Table Reservation Confirmed!* Restaurant: *{{branch_name}}* · Booking ID: *{{booking_id}}* · People: *{{guest_count}}*. You will receive WhatsApp updates here.",
  "dinein|resume":      "\u25B6\uFE0F *Booking Resumed!* Hello {{customer_name}}, your booking has been resumed. Please wait for your table to be assigned shortly. \uD83C\uDF7D\uFE0F",

  "takeaway|received":  "\uD83D\uDED2 Order received! Hi {{customer_name}}, we got your order *#{{order_id}}* at {{branch_name}}. We will confirm shortly.",
  "takeaway|confirmed": "\u2705 Thank you! Your order *#{{order_id}}* has been received at *{{branch_name}}*. Token Number: *#{{order_id}}*. Your order will be processed shortly.",
  "takeaway|preparing": "\uD83D\uDC68\u200D\uD83C\uDF73 *Order being prepared:* Your order *#{{order_id}}* at {{branch_name}} is now in the kitchen. Estimated ready in *{{ready_time}}*.",
  "takeaway|ready":     "\uD83C\uDF71 *Your Order #{{order_id}}* is ready at {{branch_name}} ({{pickup_counter}}). Please pick it up!",
  "takeaway|delivered": "\u2705 Your order *#{{order_id}}* has been successfully delivered. Thank you for choosing {{branch_name}} at {{foodcourt_name}}! \uD83C\uDF89 Enjoy your meal!",
  "takeaway|call_again":"\uD83D\uDD14 *Reminder!* Your *#{{order_id}}* is ready for pickup. Please collect it soon from {{branch_name}}.",

  "events|ticket":             "\uD83C\uDF9F\uFE0F *Your ticket is confirmed!* Hello {{customer_name}}, your booking *{{booking_id}}* for *{{event_name}}* is confirmed.\n\n\uD83D\uDCC5 Date: *{{slot_date}}*\n\u23F0 Slot: *{{slot_time}}*\n\uD83D\uDCCD Venue: {{venue}}\n\uD83D\uDC65 Guests: {{family_count}}\n\uD83D\uDCB0 Advance paid: {{amount_paid}} (redeemable at billing)\n\nShow the attached QR ticket at the entrance. See you there!",
  "events|reminder_day":       "\uD83D\uDD14 *Tomorrow!* {{customer_name}}, your visit to *{{event_name}}* is on *{{slot_date}}* at *{{slot_time}}*. Booking: *{{booking_id}}*.\n\uD83D\uDCCD {{venue}}\n\uD83D\uDDFA\uFE0F {{maps_link}}\n\nKeep your QR ticket handy!",
  "events|reminder_hour":      "\u23F0 *In 1 hour:* {{customer_name}}, your slot at *{{event_name}}* starts at *{{slot_time}}*. Please start heading to {{venue}}. Booking *{{booking_id}}*.",
  "events|slot_active":        "\u26A1 *Your slot is live!* {{customer_name}}, your *{{slot_time}}* slot at *{{event_name}}* is now active. Please proceed to the entrance with your QR ticket. Booking *{{booking_id}}*.",
  "events|arrived":            "\uD83D\uDCCD *Arrival confirmed!* Welcome {{customer_name}} — your arrival at *{{event_name}}* has been recorded. Please proceed to the entry gate for check-in. Booking *{{booking_id}}*.",
  "events|checked_in":         "\u2705 *Welcome to {{event_name}}!* {{customer_name}}, you are checked in. Your advance of {{amount_paid}} can be redeemed at any billing counter with booking *{{booking_id}}*. Enjoy your visit!",
  "events|thank_you_feedback": "\uD83D\uDE4F *Thank you for visiting {{event_name}}!* {{customer_name}}, we hope you had a great time. We would love your feedback:\n{{feedback_link}}\n\nFor any queries: {{support_contact}}",
};

// Tiny localized seeds for a handful of representative triggers so the
// language switcher visibly works out-of-the-box. Anything missing falls
// back to the English default.
export const WA_DEFAULTS_LOCALIZED: Record<string, Record<string, string>> = {
  ar: {
    "fifo|joined":        "\uD83C\uDFAB *تم إصدار التذكرة!* مرحباً {{customer_name}}، رقم تذكرتك *{{ticket_number}}* لخدمة {{service_name}} في {{branch_name}}. ترتيبك الحالي *{{queue_position}}* والوقت المتوقع {{wait_time}} دقيقة.",
    "fifo|get_ready":     "\u23F0 *استعد يا {{customer_name}}!* اقترب دورك لخدمة {{service_name}} في {{branch_name}} — ترتيبك الحالي *{{queue_position}}*. يرجى البدء بالتوجه إلى المكان. التذكرة *{{ticket_number}}*.",
    "fifo|now_serving":   "\u2705 *الدور الحالي:* تذكرة *{{ticket_number}}* — يرجى التوجه إلى *{{counter_no}}* في {{branch_name}}. أهلاً {{customer_name}}!",
    "dinein|table_ready": "\u2705 *الطاولة جاهزة!* طاولتك في *{{branch_name}}* جاهزة! الطاولة: *{{table_no}}* · الضيوف: *{{guest_count}}* · رقم الحجز: *{{booking_id}}*",
    "takeaway|ready":     "\uD83C\uDF71 *طلبك #{{order_id}}* جاهز في {{branch_name}} ({{pickup_counter}}). يرجى الاستلام!",
  },
  es: {
    "fifo|joined":        "\uD83C\uDFAB *¡Ticket emitido!* Hola {{customer_name}}, tu número es *{{ticket_number}}* para {{service_name}} en {{branch_name}}. Posición actual: *{{queue_position}}* — espera estimada: {{wait_time}} min.",
    "fifo|get_ready":     "\u23F0 *¡Prepárate, {{customer_name}}!* Tu turno para {{service_name}} en {{branch_name}} se acerca — estás en la posición *{{queue_position}}*. Ve acercándote, por favor. Ticket *{{ticket_number}}*.",
    "fifo|now_serving":   "\u2705 *Atendiendo:* Ticket *{{ticket_number}}* — pase al *{{counter_no}}* en {{branch_name}}. ¡Bienvenido/a, {{customer_name}}!",
    "dinein|table_ready": "\u2705 *¡Mesa lista!* Tu mesa en *{{branch_name}}* está lista. Mesa: *{{table_no}}* · Comensales: *{{guest_count}}* · Reserva: *{{booking_id}}*",
    "takeaway|ready":     "\uD83C\uDF71 *Tu pedido #{{order_id}}* está listo en {{branch_name}} ({{pickup_counter}}). ¡Pásalo a recoger!",
  },
  fr: {
    "fifo|joined":        "\uD83C\uDFAB *Ticket émis !* Bonjour {{customer_name}}, votre numéro est *{{ticket_number}}* pour {{service_name}} à {{branch_name}}. Position : *{{queue_position}}* — attente : {{wait_time}} min.",
    "fifo|get_ready":     "\u23F0 *Préparez-vous, {{customer_name}} !* Votre tour pour {{service_name}} à {{branch_name}} approche — vous êtes en position *{{queue_position}}*. Veuillez commencer à vous rapprocher. Ticket *{{ticket_number}}*.",
    "fifo|now_serving":   "\u2705 *À votre tour :* Ticket *{{ticket_number}}* — rendez-vous au *{{counter_no}}* à {{branch_name}}. Bienvenue, {{customer_name}} !",
  },
  hi: {
    "fifo|joined":        "\uD83C\uDFAB *टिकट जारी!* नमस्ते {{customer_name}}, आपका टिकट *{{ticket_number}}* है — सेवा {{service_name}} ({{branch_name}})। वर्तमान स्थान: *{{queue_position}}*, अनुमानित प्रतीक्षा: {{wait_time}} मिनट।",
    "fifo|get_ready":     "\u23F0 *तैयार हो जाइए, {{customer_name}}!* {{branch_name}} पर {{service_name}} के लिए आपकी बारी जल्द आने वाली है — आपका स्थान *{{queue_position}}* है। कृपया वहाँ पहुँचना शुरू करें। टिकट *{{ticket_number}}*।",
    "fifo|now_serving":   "\u2705 *अब बुलाया जा रहा है:* टिकट *{{ticket_number}}* — कृपया *{{counter_no}}* पर जाएं ({{branch_name}})। स्वागत है, {{customer_name}}!",
  },
  ta: {
    "fifo|joined":        "\uD83C\uDFAB *டிக்கெட் வழங்கப்பட்டது!* வணக்கம் {{customer_name}}, உங்கள் டிக்கெட் எண் *{{ticket_number}}* — சேவை: {{service_name}} ({{branch_name}}). தற்போதைய இடம்: *{{queue_position}}*, தோராயமான காத்திருப்பு: {{wait_time}} நிமிடம்.",
    "fifo|get_ready":     "\u23F0 *தயாராகுங்கள், {{customer_name}}!* {{branch_name}} இல் {{service_name}} சேவைக்கான உங்கள் முறை விரைவில் வரும் — உங்கள் இடம் *{{queue_position}}*. தயவுசெய்து புறப்படத் தொடங்குங்கள். டிக்கெட் *{{ticket_number}}*.",
    "fifo|now_serving":   "\u2705 *இப்போது அழைப்பு:* டிக்கெட் *{{ticket_number}}* — *{{counter_no}}* க்கு செல்லவும் ({{branch_name}}). வரவேற்கிறோம், {{customer_name}}!",
    "dinein|table_ready": "\u2705 *மேசை தயார்!* {{branch_name}} இல் உங்கள் மேசை தயார். மேசை: *{{table_no}}* · விருந்தினர்கள்: *{{guest_count}}* · முன்பதிவு எண்: *{{booking_id}}*.",
    "takeaway|ready":     "\uD83C\uDF71 *உங்கள் ஆர்டர் #{{order_id}}* {{branch_name}} இல் தயார் ({{pickup_counter}}). தயவுசெய்து எடுத்துச் செல்லவும்.",
  },
  zh: {
    "fifo|joined":        "\uD83C\uDFAB *已出票！* {{customer_name}} 您好，您的票号为 *{{ticket_number}}*，服务：{{service_name}}（{{branch_name}}）。当前位置 *{{queue_position}}*，预计等待 {{wait_time}} 分钟。",
    "fifo|get_ready":     "\u23F0 *请准备，{{customer_name}}！* 您在 {{branch_name}} 的 {{service_name}} 即将轮到您 — 当前位置 *{{queue_position}}*。请尽快前往。票号 *{{ticket_number}}*。",
    "fifo|now_serving":   "\u2705 *现在叫号：* 票号 *{{ticket_number}}* — 请前往 *{{counter_no}}*（{{branch_name}}）。{{customer_name}}，欢迎！",
  },
};

// Map a branch.queueMode value to one of the WhatsApp template modes.
// Branch queueMode uses both snake_case and camelCase variants; a couple
// of legacy values also need folding.
export function normalizeWaMode(queueMode: string | null | undefined): WaMode {
  const v = (queueMode || "fifo").toLowerCase();
  if (v === "dine_in" || v === "dinein") return "dinein";
  if (v === "check_in" || v === "checkin") return "checkin";
  if (v === "multi_stage" || v === "multistage" || v === "multi-stage") return "multistage";
  if (v === "takeaway" || v === "take_away") return "takeaway";
  if (v === "selective") return "selective";
  if (v === "events" || v === "event") return "events";
  return "fifo";
}

export function getDefaultWaTemplate(mode: string, triggerKey: string, lang: string): string {
  const fullKey = `${mode}|${triggerKey}`;
  if (lang && lang !== "en") {
    const localized = WA_DEFAULTS_LOCALIZED[lang];
    if (localized && Object.prototype.hasOwnProperty.call(localized, fullKey)) {
      return localized[fullKey];
    }
  }
  return WA_DEFAULTS_EN[fullKey] || "";
}

// Substitute every `{{var}}` placeholder. Missing variables render as
// empty so customer-facing messages never leak literal `{{name}}` text.
// (The Super Admin preview uses its own client-side renderer that keeps
// placeholders visible against sample data — see super-admin.html.)
export function renderWaTemplate(body: string, vars: Record<string, string | number | undefined | null>): string {
  if (!body) return "";
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

// Bundle returned by GET /api/superadmin/whatsapp-defaults.
export interface WaTemplateBundle {
  modes: WaModeMeta[];
  languages: WaLanguageMeta[];
  triggers: Record<WaMode, WaTriggerMeta[]>;
  variables: Record<WaMode, string[]>;
  sampleData: Record<string, string>;
  defaultsEn: Record<string, string>;
  defaultsLocalized: Record<string, Record<string, string>>;
}

export function getWaTemplateBundle(): WaTemplateBundle {
  return {
    modes: WA_MODES,
    languages: WA_LANGUAGES,
    triggers: WA_TRIGGERS,
    variables: WA_VARIABLES,
    sampleData: WA_SAMPLE_DATA,
    defaultsEn: WA_DEFAULTS_EN,
    defaultsLocalized: WA_DEFAULTS_LOCALIZED,
  };
}
