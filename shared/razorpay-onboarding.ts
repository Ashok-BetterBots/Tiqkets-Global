// Shared safe metadata contract. Never add bank/PAN/GST fields here: sensitive
// onboarding values are transit-only server request data.
export type OrganizerPayoutProfileView = {
  organizationId: string;
  accountId: string;
  status: string;
  accountType: string | null;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  phoneLast4: string | null;
  lastReconciledAt: Date | null;
  statusReason: string | null;
};

export const ACTIVE_ROUTE_ACCOUNT_STATUSES = new Set(["active", "activated"]);

// Ticket payments are an Event-account capability. Razorpay classifies this
// activity under its media-and-entertainment ticketing category—not the
// similarly named values that may look intuitive but are rejected upstream.
export const EVENT_ROUTE_BUSINESS_PROFILE = {
  category: "media_and_entertainment",
  subcategory: "ticketing",
} as const;

// Razorpay validates category/subcategory as a pair. Keep the event-facing
// catalog intentionally limited to documented choices relevant to organizers.
export const RAZORPAY_BUSINESS_CATEGORIES = [
  {
    value: "media_and_entertainment",
    label: "Media and entertainment",
    subcategories: [
      { value: "video_on_demand", label: "Video on demand" },
      { value: "music_streaming", label: "Music streaming" },
      { value: "multiplex", label: "Multiplex" },
      { value: "content_and_publishing", label: "Content and publishing" },
      { value: "ticketing", label: "Ticketing" },
      { value: "news", label: "News" },
      { value: "video_game_arcades", label: "Video game arcades" },
      { value: "amusement_parks_and_circuses", label: "Amusement parks and circuses" },
      { value: "ticket_agencies", label: "Ticket agencies" },
    ],
  },
  {
    value: "services",
    label: "Services",
    subcategories: [
      { value: "event_planning", label: "Event planning" },
      { value: "consulting", label: "Consulting" },
      { value: "ad_and_marketing", label: "Advertising and marketing" },
      { value: "photography_labs", label: "Photography" },
      { value: "recreation_and_sporting_camps", label: "Recreation and sporting camps" },
      { value: "barber_and_beauty_shops", label: "Barber and beauty shops" },
    ],
  },
  {
    value: "education",
    label: "Education",
    subcategories: [
      { value: "college", label: "College" },
      { value: "school", label: "School" },
      { value: "university", label: "University" },
      { value: "professional_courses", label: "Professional courses" },
      { value: "coaching", label: "Coaching" },
      { value: "elearning", label: "E-learning" },
      { value: "vocational_and_trade_schools", label: "Vocational and trade schools" },
      { value: "sporting_clubs", label: "Sporting clubs" },
      { value: "dance_halls_studios_and_schools", label: "Dance halls, studios and schools" },
    ],
  },
  {
    value: "tours_and_travel",
    label: "Tours and travel",
    subcategories: [
      { value: "accommodation", label: "Accommodation" },
      { value: "travel_agency", label: "Travel agency" },
      { value: "tourist_attractions_and_exhibits", label: "Tourist attractions and exhibits" },
      { value: "aquariums_dolphinariums_and_seaquariums", label: "Aquariums and seaquariums" },
    ],
  },
  {
    value: "food",
    label: "Food",
    subcategories: [
      { value: "restaurant", label: "Restaurant" },
      { value: "food_court", label: "Food court" },
      { value: "catering", label: "Catering" },
      { value: "restaurant_search_and_booking", label: "Restaurant search and booking" },
    ],
  },
] as const;