export const equipmentHoldReason = "Equipment price is not set yet, so this line stays off checkout.";

/** Celexo PRO from the 8-page ABio materials brochure. No selling price is printed there. */
export const equipmentCatalog = [
  {
    sku: "CELEXO-PRO",
    name: "Celexo PRO",
    category: "Aesthetic equipment",
    form: "4-in-1 multi-functional platform",
    size: "Main unit, cart, and four handpieces · 15 kg",
    image: "/images/celexo-pro.png",
    tagline: "One device, four solutions — the platform for every skin protocol.",
    manufacturer: "ABio materials",
    highlights: [
      "Four handpieces for cleansing, lifting, activation, and smoothing",
      "Intuitive touch interface with custom protocols per skin concern",
      "Separable design for flexible placement in the treatment room",
      "Easy protocol switching from the first step to the last",
    ],
    handpieces: [
      {
        name: "Ultrasonic peeling",
        role: "Cleansing",
        detail:
          "25 kHz spatula with cleansing, absorption, and lifting modes. Four ultrasonic transducers for uniform vibration.",
      },
      {
        name: "LIPUS",
        role: "Activation",
        detail:
          "Low-intensity pulsed ultrasound at 1 / 3 / 10 / 17 MHz, alternating 50× per second. Dermis and epidermis modes by depth.",
      },
      {
        name: "SLM",
        role: "Lifting",
        detail:
          "Rubbing-type handpiece with a 3.0 mm tip. Delivers comfortable, gap-free thermal lifting without a linear shot pattern.",
      },
      {
        name: "Cryo-thermal",
        role: "Smoothing",
        detail:
          "Single handpiece for pre- and post-care. Cooling to −10°C and thermal to 45°C via a Peltier system.",
      },
    ],
    description:
      "4-in-1 platform from ABio materials. Handpieces: ultrasonic peeling at 25 kHz (cleansing, absorption, and lifting modes), LIPUS low-intensity pulsed ultrasound (dermis 1/3/10 MHz, epidermis 10/17 MHz), SLM rubbing handpiece with a 3.0 mm tip, and cryo-thermal (thermal 30–45°C, cooling −10–10°C). KC-certified beauty device, not a medical device. It provides no medical efficacy or effect beyond cosmetic purposes.",
    disclaimer:
      "KC-certified beauty device, not a medical device. It provides no medical efficacy or effect beyond cosmetic purposes.",
  },
] as const;
