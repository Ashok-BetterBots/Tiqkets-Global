import { db } from "./db";
import { storage, hashPassword } from "./storage";
import {
  organizations,
  branches,
  services,
  journeys,
  journeyStages,
} from "@shared/schema";

async function seed() {
  console.log("Starting database seed...");

  const existingOrg = await storage.getOrganizationByEmail("demo@tiqkets.com");
  if (existingOrg) {
    console.log("Demo data already exists. Skipping seed.");
    return;
  }

  const org = await storage.createOrganization({
    name: "TIQKETS Demo Company",
    email: "demo@tiqkets.com",
    password: "demo123",
    phone: "+1234567890",
    address: "123 Main Street",
    city: "San Francisco",
    state: "California",
    pincode: "94102",
    latitude: "37.7749",
    longitude: "-122.4194",
    category: "services",
    description: "Demo organization for testing the TIQKETS queue management system",
    isVerified: true,
    isActive: true,
  });
  console.log("Created demo organization:", org.id);

  const mainBranch = await storage.createBranch({
    organizationId: org.id,
    name: "Main Branch - Downtown",
    address: "123 Main Street",
    city: "San Francisco",
    state: "California",
    pincode: "94102",
    phone: "+1234567890",
    email: "main@tiqkets.com",
    latitude: "37.7749",
    longitude: "-122.4194",
    isActive: true,
    queueMode: "fifo",
    notificationMode: "all_alerts",
    autoCallNext: false,
    maxQueueSize: 100,
    defaultSlotDuration: 30,
    defaultSlotCapacity: 5,
    displaySettings: {
      showQueuePosition: true,
      showEstimatedWait: true,
      showTicketNumber: true,
    },
    apiSettings: {},
  });
  console.log("Created main branch:", mainBranch.id);

  const northBranch = await storage.createBranch({
    organizationId: org.id,
    name: "North Branch - Marina",
    address: "456 Marina Blvd",
    city: "San Francisco",
    state: "California",
    pincode: "94123",
    phone: "+1234567891",
    email: "north@tiqkets.com",
    latitude: "37.8035",
    longitude: "-122.4365",
    isActive: true,
    queueMode: "selective",
    notificationMode: "turn_only",
    autoCallNext: true,
    maxQueueSize: 50,
    defaultSlotDuration: 30,
    defaultSlotCapacity: 3,
    displaySettings: {
      showQueuePosition: true,
      showEstimatedWait: true,
    },
    apiSettings: {},
  });
  console.log("Created north branch:", northBranch.id);

  const dineInBranch = await storage.createBranch({
    organizationId: org.id,
    name: "Restaurant - Dine In",
    address: "789 Food Street",
    city: "San Francisco",
    state: "California",
    pincode: "94110",
    phone: "+1234567892",
    email: "restaurant@tiqkets.com",
    latitude: "37.7599",
    longitude: "-122.4148",
    isActive: true,
    queueMode: "dine_in",
    notificationMode: "all_alerts",
    autoCallNext: false,
    maxQueueSize: 30,
    defaultSlotDuration: 30,
    defaultSlotCapacity: 8,
    displaySettings: {},
    apiSettings: {},
  });
  console.log("Created dine in branch:", dineInBranch.id);

  const generalConsult = await storage.createService({
    branchId: mainBranch.id,
    name: "General Consultation",
    description: "General customer support and inquiries",
    averageWaitTime: 15,
    estimatedDuration: 20,
    isActive: true,
    inputFields: [
      { id: "reason", label: "Reason for Visit", type: "select", required: true, options: ["New Account", "Inquiry", "Complaint", "Other"] }
    ],
  });
  console.log("Created service:", generalConsult.name);

  const docProcessing = await storage.createService({
    branchId: mainBranch.id,
    name: "Document Processing",
    description: "Process official documents and certificates",
    averageWaitTime: 20,
    estimatedDuration: 30,
    isActive: true,
    requiresInPersonRegistration: true,
    inPersonPerimeterMeters: 100,
    inputFields: [
      { id: "docType", label: "Document Type", type: "select", required: true, options: ["ID Renewal", "Certificate", "License", "Permit"] },
      { id: "notes", label: "Additional Notes", type: "text", required: false }
    ],
  });
  console.log("Created service:", docProcessing.name);

  const vipService = await storage.createService({
    branchId: mainBranch.id,
    name: "VIP Services",
    description: "Priority service for premium customers",
    averageWaitTime: 5,
    estimatedDuration: 25,
    isActive: true,
    inputFields: [
      { id: "membershipId", label: "Membership ID", type: "text", required: true },
    ],
  });
  console.log("Created service:", vipService.name);

  const walkInService = await storage.createService({
    branchId: northBranch.id,
    name: "Walk-in Appointments",
    description: "Quick appointments for urgent matters",
    averageWaitTime: 10,
    estimatedDuration: 15,
    isActive: true,
    inputFields: [],
  });
  console.log("Created service:", walkInService.name);

  const hospitalJourney = await storage.createJourney({
    branchId: mainBranch.id,
    name: "Medical Visit Journey",
    description: "Full hospital visit flow",
    isActive: true,
  });
  console.log("Created journey:", hospitalJourney.name);

  await storage.updateJourneyStages(hospitalJourney.id, [
    { serviceName: "Registration", stageOrder: 1, isOptional: false, estimatedDuration: 5 },
    { serviceName: "Doctor Consultation", stageOrder: 2, isOptional: false, estimatedDuration: 20 },
    { serviceName: "Lab Tests", stageOrder: 3, isOptional: true, estimatedDuration: 15 },
    { serviceName: "Pharmacy", stageOrder: 4, isOptional: false, estimatedDuration: 10 },
  ]);
  console.log("Created journey stages for:", hospitalJourney.name);

  const adminUser = await storage.createOrgUser({
    organizationId: org.id,
    name: "Admin User",
    email: "admin@tiqkets.com",
    password: "admin123",
    role: "admin",
    isActive: true,
  });
  console.log("Created admin user:", adminUser.email);

  const locationManager = await storage.createOrgUser({
    organizationId: org.id,
    branchId: mainBranch.id,
    name: "Location Manager",
    email: "manager@tiqkets.com",
    password: "manager123",
    role: "location_manager",
    isActive: true,
  });
  await storage.setOrgUserBranches(locationManager.id, [mainBranch.id, northBranch.id]);
  console.log("Created location manager:", locationManager.email);

  const frontDesk = await storage.createOrgUser({
    organizationId: org.id,
    branchId: mainBranch.id,
    name: "Front Desk Staff",
    email: "frontdesk@tiqkets.com",
    password: "frontdesk123",
    role: "front_desk",
    serviceId: generalConsult.id,
    isActive: true,
  });
  console.log("Created front desk user:", frontDesk.email);

  console.log("\nSeed complete!");
  console.log("\n=== Demo Login Credentials ===");
  console.log("Organization: demo@tiqkets.com / demo123");
  console.log("Admin User: admin@tiqkets.com / admin123");
  console.log("Manager: manager@tiqkets.com / manager123");
  console.log("Front Desk: frontdesk@tiqkets.com / frontdesk123");
  console.log("\n=== Demo Branches ===");
  console.log(`Main Branch: ${mainBranch.id}`);
  console.log(`North Branch: ${northBranch.id}`);
  console.log(`Dine In Branch: ${dineInBranch.id}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  });
