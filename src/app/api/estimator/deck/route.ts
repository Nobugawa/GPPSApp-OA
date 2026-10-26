import { NextResponse } from 'next/server';

type EstimatorInput = {
  lengthFt:number;
  widthFt:number;
  longRailSides:number;
  shortRailSides:number;
  stairOpeningFt:number;
  railingMaterial:'wood'|'pvc'|'none';
  stairCount:number;
  stairWidthFt:number;
  deckHeightFt:number|null;
  railingAccess:'topside'|'ladder'|'mixed'|'auto';
  terrainAccessNotes:string;
  condition:'light'|'moderate'|'heavy';
  repairHours:number;
  coats:number;
  laborRate:number;
  stainCostPerGallon:number;
  scopeText?:string;
  photoUrls?:string[];
};

type ProposalLine = {
  type:'labor'|'material';
  description:string;
  quantity:number;
  unit:string;
  unitPrice:number;
  internalCost?:number|null;
};

function roundQuarter(value:number){
  return Math.max(0,Math.round(value*4)/4);
}

function deterministicProposal(input:EstimatorInput){
  const deckArea=Math.max(0,input.lengthFt*input.widthFt);
  const factor=input.condition==='heavy'?1.45:input.condition==='moderate'?1.2:1;
  const coats=Math.max(1,input.coats||1);
  const repairHours=Math.max(0,input.repairHours||0);
  const laborRate=Math.max(0,input.laborRate||0);

  const rawRailLf=(Math.max(0,input.longRailSides)*input.lengthFt)+(Math.max(0,input.shortRailSides)*input.widthFt);
  const railingLf=Math.max(0,rawRailLf-Math.max(0,input.stairOpeningFt||0));

  const totalTreadWidthFt=Math.max(0,input.stairCount||0)*Math.max(0,input.stairWidthFt||0);
  const stairFinishArea=totalTreadWidthFt*1.5;

  const inferredDeckHeightFt=Math.max(0,(Math.max(0,input.stairCount||0)*7.5)/12);
  const hasManualHeight=Number.isFinite(Number(input.deckHeightFt)) && Number(input.deckHeightFt) >= 0;
  const estimatedDeckHeightFt=hasManualHeight ? Number(input.deckHeightFt) : inferredDeckHeightFt;
  const elevationSource=hasManualHeight ? 'manual' : 'stairs';
  const elevationClass=estimatedDeckHeightFt < 2.5 ? 'ground' : estimatedDeckHeightFt < 5 ? 'low' : 'elevated';
  const effectiveRailingAccess=input.railingAccess==='auto'
    ? (elevationClass==='elevated' ? 'mixed' : 'topside')
    : input.railingAccess;
  const elevationSetupHours=elevationClass==='elevated' ? 1.0 : elevationClass==='low' ? 0.35 : 0;
  const railingAccessHours=input.railingMaterial==='wood' && railingLf>0
    ? effectiveRailingAccess==='ladder'
      ? roundQuarter(railingLf/18)
      : effectiveRailingAccess==='mixed'
        ? roundQuarter(railingLf/32)
        : 0
    : 0;

  const woodRailFinishArea=input.railingMaterial==='wood' ? railingLf*4.5 : 0;
  const estimatedBalusterCount=input.railingMaterial==='wood' ? Math.round(railingLf*12/5.5) : 0;

  const cleanArea=deckArea+stairFinishArea+(input.railingMaterial==='none'?0:railingLf*3.25);
  const sandArea=deckArea+stairFinishArea+woodRailFinishArea;
  const stainArea=deckArea+stairFinishArea+woodRailFinishArea;

  const setupHours=roundQuarter(1.5+elevationSetupHours+railingAccessHours);
  const cleanHours=roundQuarter(Math.max(1.5,cleanArea/160)*factor);
  const sandHours=roundQuarter(Math.max(2,sandArea/90)*factor);
  const stainHours=roundQuarter(Math.max(1.5,(stainArea/145)*coats));
  const totalLaborHours=roundQuarter(setupHours+cleanHours+sandHours+stainHours+repairHours);

  const stainGallons=Math.max(1,Math.ceil((stainArea*coats*1.1)/250));
  const cleanerAllowance=Math.max(25,Math.round(cleanArea*0.07));
  const sandingAllowance=Math.max(35,Math.round(sandArea*0.10));
  const miscAllowance=Math.max(25,Math.round(stainArea*0.03));

  const railingDescription=input.railingMaterial==='wood' && railingLf>0
    ? ` Includes approximately ${railingLf.toFixed(0)} LF of wood railing/balusters (~${estimatedBalusterCount} balusters estimated for planning).`
    : input.railingMaterial==='pvc' && railingLf>0
      ? ` Includes cleaning approximately ${railingLf.toFixed(0)} LF of PVC railing; no railing stain is included.`
      : '';

  const lines:ProposalLine[]=[
    {
      type:'labor',
      description:'Deck cleaning, surface preparation, sanding, staining, stairs and normal setup/cleanup.'+railingDescription,
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
      unitPrice:Math.max(0,input.stainCostPerGallon||0),
      internalCost:Math.max(0,input.stainCostPerGallon||0)
    },
    {
      type:'material',
      description:'Cleaner / prep chemicals allowance',
      quantity:1,unit:'allowance',unitPrice:cleanerAllowance,internalCost:cleanerAllowance
    },
    {
      type:'material',
      description:'Sanding discs, sheets and abrasive consumables allowance',
      quantity:1,unit:'allowance',unitPrice:sandingAllowance,internalCost:sandingAllowance
    },
    {
      type:'material',
      description:'Masking, applicators and miscellaneous consumables allowance',
      quantity:1,unit:'allowance',unitPrice:miscAllowance,internalCost:miscAllowance
    }
  ];

  const subtotal=lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);

  return {
    source:'deterministic',
    measurements:{
      deckAreaSqFt:deckArea,
      railingLf:Math.round(railingLf*10)/10,
      estimatedBalusterCount,
      totalTreadWidthFt:Math.round(totalTreadWidthFt*10)/10,
      stairFinishAreaSqFt:Math.round(stairFinishArea),
      estimatedDeckHeightFt:Math.round(estimatedDeckHeightFt*10)/10,
      inferredDeckHeightFt:Math.round(inferredDeckHeightFt*10)/10,
      elevationSource,
      elevationClass,
      railingAccess:effectiveRailingAccess,
      effectiveFinishAreaSqFt:Math.round(stainArea)
    },
    labor:{
      setupHours,cleaningHours:cleanHours,sandingHours:sandHours,stainingHours:stainHours,
      repairHours,elevationSetupHours,railingAccessHours,totalHours:totalLaborHours,hourlyRate:laborRate
    },
    materials:{stainGallons,stainCostPerGallon:input.stainCostPerGallon,cleanerAllowance,sandingAllowance,miscAllowance},
    lines,
    subtotal:Math.round(subtotal*100)/100,
    assumptions:[
      'Railing linear footage is calculated from the selected long and short deck edges, less the stair opening.',
      'Wood railing/baluster finishing is included when Wood is selected. PVC railing is treated as cleaning only.',
      'Stair labor is driven primarily by total tread width/surface, not simply the number of treads.',
      'Deck elevation uses the manually entered height when provided; otherwise it is inferred from stair count using a 7.5-inch planning riser.',
      'Elevated decks include additional setup/productivity allowance. Exterior railing access adds more labor when ladder work is required.',
      'Baluster count is a planning estimate from railing length and typical spacing; field verification controls.',
      'Repair hours are an explicit allowance and should be adjusted after inspection.',
      'Site access/terrain notes and photos are estimating inputs; unusual slopes, vegetation, retaining walls, fences or poor ladder footing can increase labor and risk.',
      'Customer approval is required before this proposal becomes customer-facing.'
    ],
    flags:[
      ...(input.condition==='heavy'?['Heavy condition selected; prep labor may vary materially after washing/sanding begins.']:[]),
      ...(repairHours===0?['No repair labor allowance entered. Add one if board/rail repairs are expected.']:[]),
      ...(elevationClass==='elevated' ? ['Elevation '+(elevationSource==='manual'?'entered':'inferred')+' at about '+estimatedDeckHeightFt.toFixed(1)+' ft; elevated-access allowance included.'] : []),
      ...(effectiveRailingAccess==='ladder' ? ['Ladder/exterior access selected for wood railing; additional railing access labor included.'] : [])
    ]
  };
}

function extractOutputText(response:any){
  if(typeof response?.output_text==='string') return response.output_text;
  const parts=Array.isArray(response?.output)?response.output:[];
  for(const item of parts){
    if(!Array.isArray(item?.content)) continue;
    for(const part of item.content) if(typeof part?.text==='string') return part.text;
  }
  return '';
}

async function enrichWithAI(input:EstimatorInput,base:any){
  const key=process.env.OPENAI_API_KEY;
  if(!key||!input.photoUrls?.length) return base;

  const imageContent=input.photoUrls.slice(0,12).map(url=>({type:'input_image',image_url:url,detail:'low'}));
  const prompt=`You are assisting a field-service contractor with a deck refinishing estimate.
Review the supplied photos and structured measurements. Do not invent dimensions.
Return ONLY JSON with keys: condition_summary, labor_adjustment_hours, repair_risk, photo_findings, flags.
Base labor hours: ${base.labor.totalHours}.
Deck area: ${base.measurements.deckAreaSqFt} sq ft.
Calculated railing: ${base.measurements.railingLf} LF, material ${input.railingMaterial}.
Estimated balusters: ${base.measurements.estimatedBalusterCount}.
Total stair tread width: ${base.measurements.totalTreadWidthFt} ft across ${input.stairCount} treads.
Deck height used: ${base.measurements.estimatedDeckHeightFt} ft (${base.measurements.elevationClass}, source ${base.measurements.elevationSource}).
Railing access assumption: ${base.measurements.railingAccess}.
Scope: ${input.scopeText||'Deck cleaning, repairs, sanding and staining'}.
Site access / terrain notes: ${input.terrainAccessNotes||'None supplied'}.
Be conservative. If photos are insufficient, labor_adjustment_hours must be 0.`;

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.OPENAI_ESTIMATOR_MODEL||'gpt-5.6-sol',
      input:[{role:'user',content:[{type:'input_text',text:prompt},...imageContent]}]
    })
  });
  if(!response.ok) return base;
  const data=await response.json();
  const cleaned=extractOutputText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{
    const ai=JSON.parse(cleaned);
    const adjustment=Math.max(-4,Math.min(12,Number(ai.labor_adjustment_hours)||0));
    const adjustedHours=roundQuarter(base.labor.totalHours+adjustment);
    const laborLine=base.lines.find((line:ProposalLine)=>line.type==='labor');
    if(laborLine) laborLine.quantity=adjustedHours;
    const subtotal=base.lines.reduce((sum:number,line:ProposalLine)=>sum+line.quantity*line.unitPrice,0);
    return {
      ...base,source:'deterministic+vision',
      labor:{...base.labor,totalHours:adjustedHours,visionAdjustmentHours:adjustment},
      subtotal:Math.round(subtotal*100)/100,
      vision:{
        conditionSummary:ai.condition_summary||'',
        repairRisk:ai.repair_risk||'unknown',
        photoFindings:Array.isArray(ai.photo_findings)?ai.photo_findings:[]
      },
      flags:[...base.flags,...(Array.isArray(ai.flags)?ai.flags:[])]
    };
  }catch{return base;}
}

export async function POST(req:Request){
  try{
    const input=await req.json() as EstimatorInput;
    if(!Number.isFinite(Number(input.lengthFt))||!Number.isFinite(Number(input.widthFt))||Number(input.lengthFt)<=0||Number(input.widthFt)<=0){
      return NextResponse.json({error:'Deck length and width are required.'},{status:400});
    }
    const normalized:EstimatorInput={
      lengthFt:Number(input.lengthFt),widthFt:Number(input.widthFt),
      longRailSides:Number(input.longRailSides||0),shortRailSides:Number(input.shortRailSides||0),
      stairOpeningFt:Number(input.stairOpeningFt||0),
      railingMaterial:input.railingMaterial||'wood',
      stairCount:Number(input.stairCount||0),stairWidthFt:Number(input.stairWidthFt||0),
      deckHeightFt:input.deckHeightFt===null || input.deckHeightFt===undefined ? null : Number(input.deckHeightFt),
      railingAccess:input.railingAccess||'auto',
      terrainAccessNotes:input.terrainAccessNotes||'',
      condition:input.condition||'moderate',repairHours:Number(input.repairHours||0),
      coats:Number(input.coats||2),laborRate:Number(input.laborRate||120),
      stainCostPerGallon:Number(input.stainCostPerGallon||55),
      scopeText:input.scopeText||'',photoUrls:Array.isArray(input.photoUrls)?input.photoUrls:[]
    };
    const base=deterministicProposal(normalized);
    const proposal=await enrichWithAI(normalized,base);
    return NextResponse.json(proposal);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to generate estimate proposal.'},{status:500});
  }
}
