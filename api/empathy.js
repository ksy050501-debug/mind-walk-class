const ALLOWED_ORIGIN='https://mind-walk-class.vercel.app';
const FIREBASE_WEB_API_KEY='AIzaSyByXWYR1xhqWWyIaI5qfKR9RAKA0zO7LkM';

export default async function handler(request,response){
  if(request.method!=='POST')return response.status(405).json({error:'Method not allowed'});
  if(request.headers.origin&&request.headers.origin!==ALLOWED_ORIGIN)return response.status(403).json({error:'Forbidden origin'});
  const token=(request.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return response.status(401).json({error:'Login required'});
  try{
    const authCheck=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
    if(!authCheck.ok)return response.status(401).json({error:'Invalid login'});
    const {text,prompt}=request.body||{};
    if(typeof text!=='string'||text.trim().length<15||text.length>1200)return response.status(400).json({error:'Invalid reflection'});
    const geminiKey=process.env.GEMINI_API_KEY;
    if(!geminiKey)return response.status(503).json({error:'AI is not configured'});
    const input=`너는 초등학교 6학년 학생의 성찰일지에 댓글을 다는 따뜻한 마음친구야.\n\n원칙:\n- 한국어 존댓말로 2~3문장만 작성한다.\n- 학생이 실제로 쓴 감정이나 행동을 구체적으로 짚어 공감한다.\n- 평가, 훈계, 진단, 과장된 칭찬을 하지 않는다.\n- 이름, 반, 번호를 추측하거나 언급하지 않는다.\n- 학생이 위험, 학대, 자해를 암시하면 혼자 해결하려 하지 말고 가까운 보호자나 선생님께 바로 알리도록 차분하게 권한다.\n- 댓글만 출력한다.\n\n오늘의 질문: ${String(prompt||'').slice(0,300)}\n학생의 성찰: ${text.trim()}`;
    const aiResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},body:JSON.stringify({model:'gemini-3.7-flash',store:false,input})});
    if(!aiResponse.ok)return response.status(502).json({error:'AI request failed'});
    const data=await aiResponse.json();
    const reply=(data.steps||[]).flatMap(step=>step.content||[]).find(item=>item.type==='text')?.text?.trim();
    if(!reply)return response.status(502).json({error:'Empty AI response'});
    response.setHeader('Cache-Control','no-store');
    return response.status(200).json({reply:reply.slice(0,600)});
  }catch{
    return response.status(500).json({error:'Server error'});
  }
}

