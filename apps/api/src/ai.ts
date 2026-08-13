import Groq from 'groq-sdk';
import type { InfrastructureCategory } from '@civiclens/shared';
const categories=['road','bridge','building','drainage','flood-control','facility','unknown'];
export async function analyzeImage(image:Buffer, mime:string){
 if(!process.env.GROQ_API_KEY) return {category:'facility' as InfrastructureCategory,clues:['public infrastructure'],identifiers:[],confidence:.65};
 const groq=new Groq({apiKey:process.env.GROQ_API_KEY});
 const response=await (groq as any).responses.create({model:process.env.GROQ_MODEL||'qwen/qwen3.6-27b',input:[{role:'user',content:[{type:'input_text',text:`Identify this public infrastructure. Return JSON only: {category: one of ${categories.join(',')}, clues: string[], identifiers: string[], confidence: number 0-1}. Do not claim a government project identity.`},{type:'input_image',image_url:`data:${mime};base64,${image.toString('base64')}`,detail:'auto'}]}]});
 const raw=response.output_text?.match(/\{[\s\S]*\}/)?.[0]; if(!raw) throw new Error('Groq returned invalid JSON'); const parsed=JSON.parse(raw); return {category:categories.includes(parsed.category)?parsed.category:'unknown',clues:Array.isArray(parsed.clues)?parsed.clues.slice(0,8):[],identifiers:Array.isArray(parsed.identifiers)?parsed.identifiers.slice(0,8):[],confidence:Number(parsed.confidence)||0};
}
