export type PrescribeUsaPen = {
  sku: string;
  name: string;
  category: string;
  size: string;
  strength: string;
  priceCents: number;
  description: string;
};

/** PrescribeUSA pre-filled injectable pens — practice wholesale from supplier sheet. */
export const prescribeUsaPensCatalog: PrescribeUsaPen[] = [
  {
    sku: "PUSA-GLUT-600",
    name: "Glutathione 600mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "200 mg/mL · 600 mg total",
    priceCents: 19900,
    description: "Pre-filled injectable glutathione pen for detoxification and cellular support protocols.",
  },
  {
    sku: "PUSA-GLP1S-1-5",
    name: "GLP-1S Pen 1.5mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "0.6 mL pen",
    strength: "2.5 mg/mL · 1.5 mg total",
    priceCents: 19900,
    description: "Pre-filled GLP-1S injectable pen for metabolic / weight-management protocols.",
  },
  {
    sku: "PUSA-GLP1S-3-5",
    name: "GLP-1S Pen 3.5mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "0.7 mL pen",
    strength: "5 mg/mL · 3.5 mg total",
    priceCents: 19900,
    description: "Pre-filled GLP-1S injectable pen for metabolic / weight-management protocols.",
  },
  {
    sku: "PUSA-GLP1S-5-5",
    name: "GLP-1S Pen 5.5mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "1.1 mL pen",
    strength: "5 mg/mL · 5.5 mg total",
    priceCents: 19900,
    description: "Pre-filled GLP-1S injectable pen for metabolic / weight-management protocols.",
  },
  {
    sku: "PUSA-GLP1S-7-5",
    name: "GLP-1S Pen 7.5mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "1.5 mL pen",
    strength: "5 mg/mL · 7.5 mg total",
    priceCents: 19900,
    description: "Pre-filled GLP-1S injectable pen for metabolic / weight-management protocols.",
  },
  {
    sku: "PUSA-GLP1S-10",
    name: "GLP-1S Pen 10mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "2 mL pen",
    strength: "5 mg/mL · 10 mg total",
    priceCents: 19900,
    description: "Pre-filled GLP-1S injectable pen for metabolic / weight-management protocols.",
  },
  {
    sku: "PUSA-GLP2T-40",
    name: "GLP-2T Tirzepatide Pen 40mg",
    category: "PrescribeUSA Pens · GLP-1",
    size: "2 mL pen",
    strength: "20 mg/mL · 40 mg total",
    priceCents: 19900,
    description: "Pre-filled tirzepatide (GLP-2T) injectable pen for metabolic protocols.",
  },
  {
    sku: "PUSA-TESA-IPA-12-3",
    name: "Tesamorelin/Ipamorelin 12mg/3mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "12 mg / 3 mg total",
    priceCents: 19900,
    description: "Pre-filled Tesamorelin/Ipamorelin combination injectable pen.",
  },
  {
    sku: "PUSA-B3-1000",
    name: "B3 1000mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "333.33 mg/mL · 1000 mg total",
    priceCents: 19900,
    description: "Pre-filled B3 injectable pen.",
  },
  {
    sku: "PUSA-CJC-IPA-5-5",
    name: "CJC (no DAC)/Ipamorelin 5/5mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "5 mg / 5 mg total",
    priceCents: 19900,
    description: "Pre-filled CJC (no DAC)/Ipamorelin combination injectable pen.",
  },
  {
    sku: "PUSA-CAGRI-20",
    name: "Cagrilinitide 20mg 3mL Pen",
    category: "PrescribeUSA Pens · GLP-1",
    size: "3 mL pen",
    strength: "20 mg total",
    priceCents: 19900,
    description: "Pre-filled cagrilintide injectable pen.",
  },
  {
    sku: "PUSA-KISS-5",
    name: "Kisspeptin 5mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "5 mg total",
    priceCents: 19900,
    description: "Pre-filled Kisspeptin injectable pen.",
  },
  {
    sku: "PUSA-IPA-30",
    name: "Ipamorelin 30mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "30 mg total",
    priceCents: 19900,
    description: "Pre-filled Ipamorelin injectable pen.",
  },
  {
    sku: "PUSA-5A1MQ-50",
    name: "5 Amino 1mq 50mg 3mL Pen",
    category: "PrescribeUSA Pens",
    size: "3 mL pen",
    strength: "50 mg total",
    priceCents: 19900,
    description: "Pre-filled 5-Amino-1MQ injectable pen.",
  },
];
