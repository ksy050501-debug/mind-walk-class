import crypto from 'node:crypto';

const FIREBASE_WEB_API_KEY='AIzaSyByXWYR1xhqWWyIaI5qfKR9RAKA0zO7LkM';
const TEACHER_EMAIL=/^teacher-class([1-3])@mindwalk\.school$/;
const STUDENT_EMAIL=/^student-g6-c([1-3])-n(0[1-9]|1[0-9]|2[0-2])@mindwalk\.school$/;

function base64url(value){return Buffer.from(value).toString('base64url')}

async function getAdminToken(){
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('ADMIN_NOT_CONFIGURED');
  const serviceAccount=JSON.parse(raw);
  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=base64url(JSON.stringify({iss:serviceAccount.client_email,sub:serviceAccount.client_email,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600,scope:'https://www.googleapis.com/auth/cloud-platform'}));
  const unsigned=`${header}.${payload}`;
  const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),serviceAccount.private_key).toString('base64url');
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
  if(!tokenResponse.ok)throw new Error('ADMIN_AUTH_FAILED');
  return {accessToken:(await tokenResponse.json()).access_token,projectId:serviceAccount.project_id};
}

export default async function handler(request,response){
  if(request.method!=='POST')return response.status(405).json({error:'허용되지 않은 요청입니다'});
  const token=(request.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return response.status(401).json({error:'교사 로그인이 필요합니다'});
  try{
    const teacherCheck=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
    if(!teacherCheck.ok)return response.status(401).json({error:'교사 인증이 만료되었습니다'});
    const teacherEmail=(await teacherCheck.json()).users?.[0]?.email||'';
    const teacherMatch=teacherEmail.match(TEACHER_EMAIL);
    if(!teacherMatch)return response.status(403).json({error:'교사 계정만 사용할 수 있습니다'});
    const {studentUid,newPassword}=request.body||{};
    if(typeof studentUid!=='string'||typeof newPassword!=='string'||newPassword.length<6||newPassword.length>30)return response.status(400).json({error:'학생과 새 비밀번호를 확인해 주세요'});
    const {accessToken,projectId}=await getAdminToken();
    const headers={'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`};
    const lookup=await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,{method:'POST',headers,body:JSON.stringify({localId:[studentUid]})});
    if(!lookup.ok)return response.status(404).json({error:'학생 계정을 찾을 수 없습니다'});
    const student=(await lookup.json()).users?.[0];
    const studentMatch=(student?.email||'').match(STUDENT_EMAIL);
    if(!studentMatch||studentMatch[1]!==teacherMatch[1])return response.status(403).json({error:'담당 반 학생만 초기화할 수 있습니다'});
    const update=await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,{method:'POST',headers,body:JSON.stringify({localId:studentUid,password:newPassword})});
    if(!update.ok)return response.status(502).json({error:'Firebase에서 비밀번호를 변경하지 못했습니다'});
    response.setHeader('Cache-Control','no-store');
    return response.status(200).json({ok:true});
  }catch(error){
    if(error.message==='ADMIN_NOT_CONFIGURED')return response.status(503).json({error:'관리자 기능 설정이 아직 완료되지 않았습니다'});
    return response.status(500).json({error:'비밀번호 초기화 중 오류가 발생했습니다'});
  }
}

