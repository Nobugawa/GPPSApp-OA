import { NextResponse } from 'next/server';

type EstimatorInput = {
  lengthFt: number;
  widthFt: number;
  railingLf: number;
  stairCount: number;
  condition: 'light' | 'moderate' | 'heavy';
  repairHours: number;
  coats: number;
  laborRate: number;
  stainCostPerGallon: number;
  scopeText?: string;
  photoUrls?: string[];
};

type ProposalLine = {
  type: 'labor' | 'material';
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  internalCost?: number | null;
};

function roundQuarter(value:number){
  return Math.max(0, Math.round(value * 4) / 4);
}

function deterministicProposal(input:EstimatorInput){
  const area = Math.max(0, input.lengthFt * input.widthFt);
  const factor = input.condition === 'heavy' ? 1.45 : input.condition === 'moderate' ? 1.2 : 1;
  const coats = Math.max(1, input.coats || 1);
  const railingLf = Math.max(0, input.railingLf || 0);
  const stairCount = Math.max(0, input.stairCount || 0);
  const repairHours = Math.max(0, input.repairHours || 0);
  const laborRate = Math.max(0, input.laborRate || 0);

  const setupHours = 1.5;
  const cleanHours = roundQuarter(Math.max(1.5, area / 160) * factor);
  const sandHours = roundQuarter(Math.max(2, area / 90) * factor + railingLf / 90 + stairCount * 0.08);
  const stainHours = roundQuarter((area / 145 + railingLf / 75 + stairCount * 0.12) * coats);
  const totalLaborHours = roundQuarter(setupHours + cleanHours + sandHours + stainHours + repairHours);

  const effectiveFinishArea = area + (railingLf * 3.5) + (stairCount * 5);
  const stainGallons = Math.max(1, Math.ceil((effectiveFinishArea * coats * 1.1) / 250));
  const cleanerAllowance = Math.max(25, Math.round(area * 0.07));
  const sandingAllowance = Math.max(35, Math.round((area + railingLf * 2) * 0.10));
  const miscAllowance = Math.max(25, Math.round(area * 0.03));

  const lines:ProposalLine[] = [
    {
      type:'labor',
      description:'Deck cleaning, surface preparation, sanding, staining and normal setup/cleanup',
      quantity:totalLaborHours,
      unit:'hour',
      unitPrice:laborRate,
      internalCost:null
    },
    {
      type:'material',
      description:`Exterior deck stain — estimated ${stainGallons} gallon(s)`,
      quantity:stainGallons,
      unit:'gallon',
      unitPrice:Math.max(0, input.stainCostPerGallon || 0),
      internalCost:Math.max(0, input.stainCostPerGallon || 0)
    },
    {
      type:'material',
      description:'Cleaner / prep chemicals allowance',
      quantity:1,
      unit:'allowance',
      unitPrice:cleanerAllowance,
      internalCost:cleanerAllowance
    },
    {
      type:'material',
      description:'Sanding discs, sheets and abrasive consumables allowance',
      quantity:1,
      unit:'allowance',
      unitPrice:sandingAllowance,
      internalCost:sandingAllowance
    },
    {
      type:'material',
      description:'Masking, applicators and miscellaneous consumables allowance',
      quantity:1,
      unit:'allowance',
      unitPrice:miscAllowance,
      internalCost:miscAllowance
    }
  ];

  const subtotal = lines.reduce((sum,line)=>sum + line.quantity * line.unitPrice,0);

  return {
    source:'deterministic',
    measurements:{deckAreaSqFt:area,effectiveFinishAreaSqFt:Math.round(effectiveFinishArea)},
    labor:{
      setupHours,
      cleaningHours:cleanHours,
      sandingHours:sandHours,
      stainingHours:stainHours,
      repairHours,
      totalHours:totalLaborHours,
      hourlyRate:laborRate
    },
    materials:{
      stainGallons,
      stainCostPerGallon:input.stainCostPerGallon,
      cleanerAllowance,
      sandingAllowance,
      miscAllowance
    },
    lines,
    subtotal:Math.round(subtotal * 100) / 100,
    assumptions:[
      'Deck is accessible during normal working hours.',
      'Pricing assumes normal residential access and no major hidden structural deterioration.',
      'Repair hours are an explicit allowance and should be adjusted after inspection.',
      'Stain quantity uses a planning coverage rate of about 250 sq ft per gallon per coat plus waste.',
      'Customer approval is required before this proposal becomes a customer-facing estimate.'
    ],
    flags:[
      ...(input.condition === 'heavy' ? ['Heavy condition selected; prep labor may vary materially after washing/sanding begins.'] : []),
      ...(repairHours === 0 ? ['No repair labor allowance entered. Add one if board/rail repairs are expected.'] : [])
    ]
  };
}

function extractOutputText(response:any){
  if (typeof response?.output_text === 'string') return response.output_text;
  const parts = Array.isArray(response?.output) ? response.output : [];
  for (const item of parts) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (typeof part?.text === 'string') return part.text;
    }
  }
  return '';
}

async function enrichWithAI(input:EstimatorInput, base:any){
  const key = process.env.OPENAI_API_KEY;
  if (!key || !input.photoUrls?.length) return base;

  const imageContent = input.photoUrls.slice(0,12).map(url=>({
    type:'input_image',
    image_url:url,
    detail:'low'
  }));

  const prompt = `You are assisting a field-service contractor with a deck refinishing estimate.
Review the supplied photos and the structured measurements. Do not invent dimensions.
Return ONLY JSON with keys:
condition_summary (string),
labor_adjustment_hours (number between -4 and 12),
repair_risk (low|medium|high),
photo_findings (array of short strings),
flags (array of short strings).
Base deterministic labor hours: ${base.labor.totalHours}.
Deck area: ${base.measurements.deckAreaSqFt} sq ft.
Railing: ${input.railingLf} linear ft.
Stairs: ${input.stairCount}.
User condition selection: ${input.condition}.
Scope: ${input.scopeText || 'Deck cleaning, repairs, sanding and staining'}.
Be conservative. If photos are insufficient, use adjustment 0 and say so.`;

  const response = await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${key}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      model:process.env.OPENAI_ESTIMATOR_MODEL || 'gpt-5.6-sol',
      input:[{
        role:'user',
        content:[
          {type:'input_text',text:prompt},
          ...imageContent
        ]
      }]
    })
  });

  if (!response.ok) return base;

  const data = await response.json();
  const text = extractOutputText(data).trim();
  const cleaned = text.replace(/^\`\`\`json\s*/i,'').replace(/\`\`\`$/,'').trim();

  try {
    const ai = JSON.parse(cleaned);
    const adjustment = Math.max(-4,Math.min(12,Number(ai.labor_adjustment_hours) || 0));
    const adjustedHours = roundQuarter(base.labor.totalHours + adjustment);
    const laborLine = base.lines.find((line:ProposalLine)=>line.type==='labor');
    if (laborLine) laborLine.quantity = adjustedHours;

    const subtotal = base.lines.reduce((sum:number,line:ProposalLine)=>sum + line.quantity * line.unitPrice,0);

    return {
      ...base,
      source:'deterministic+vision',
      labor:{...base.labor,totalHours:adjustedHours,visionAdjustmentHours:adjustment},
      subtotal:Math.round(subtotal*100)/100,
      vision:{
        conditionSummary:ai.condition_summary || '',
        repairRisk:ai.repair_risk || 'unknown',
        photoFindings:Array.isArray(ai.photo_findings) ? ai.photo_findings : []
      },
      flags:[...base.flags,...(Array.isArray(ai.flags) ? ai.flags : [])]
    };
  } catch {
    return base;
  }
}

export async function POST(req:Request){
  try {
    const input = await req.json() as EstimatorInput;

    if (!Number.isFinite(Number(input.lengthFt)) || !Number.isFinite(Number(input.widthFt)) || Number(input.lengthFt) <= 0 || Number(input.widthFt) <= 0) {
      return NextResponse.json({error:'Deck length and width are required.'},{status:400});
    }

    const normalized:EstimatorInput = {
      lengthFt:Number(input.lengthFt),
      widthFt:Number(input.widthFt),
      railingLf:Number(input.railingLf || 0),
      stairCount:Number(input.stairCount || 0),
      condition:input.condition || 'moderate',
      repairHours:Number(input.repairHours || 0),
      coats:Number(input.coats || 2),
      laborRate:Number(input.laborRate || 120),
      stainCostPerGallon:Number(input.stainCostPerGallon || 55),
      scopeText:input.scopeText || '',
      photoUrls:Array.isArray(input.photoUrls) ? input.photoUrls : []
    };

    const base = deterministicProposal(normalized);
    const proposal = await enrichWithAI(normalized,base);

    return NextResponse.json(proposal);
  } catch (error) {
    return NextResponse.json({
      error:error instanceof Error ? error.message : 'Unable to generate estimate proposal.'
    },{status:500});
  }
}
