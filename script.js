const API_BASE="";
const plans=[["500MB",150,"500MB"],["1GB",300,"1GB"],["2GB",600,"2GB"],["3GB",900,"3GB"],["5GB",1500,"5GB"]];

window.showData=function(){
 document.getElementById("dataSection").innerHTML=`
 <h2>Select Network</h2>
 <button onclick="showPlans('MTN')">MTN</button>
 <button onclick="showPlans('Airtel')">Airtel</button>
 <button onclick="showPlans('Glo')">Glo</button>
 <button onclick="showPlans('9mobile')">9mobile</button>`;
};

window.showPlans=function(network){
 let html=`<h2>${network} Data Plans</h2>`;
 plans.forEach(p=>html+=`<button onclick="enterNumber('${network}','${p[0]}',${p[1]},'${p[2]}')">${p[0]} - ₦${p[1].toLocaleString()}</button>`);
 html+=`<button onclick="showData()">Back</button>`;
 document.getElementById("dataSection").innerHTML=html;
};

window.enterNumber=function(network,plan,amount,productCode){
 document.getElementById("dataSection").innerHTML=`
 <h2>${network} - ${plan}</h2><p>Price: ₦${amount.toLocaleString()}</p>
 <input id="phoneNumber" type="tel" inputmode="numeric" maxlength="11" placeholder="08012345678">
 <input id="email" type="email" placeholder="Your email for payment receipt">
 <button onclick="startPayment('${network}','${plan}',${amount},'${productCode}')">Pay ₦${amount.toLocaleString()} with Paystack</button>
 <button onclick="showPlans('${network}')">Back</button>`;
};

window.startPayment=async function(network,plan,amount,productCode){
 const phone=document.getElementById("phoneNumber").value.trim();
 const email=document.getElementById("email").value.trim();
 if(!/^0\d{10}$/.test(phone)){alert("Please enter a valid 11-digit Nigerian phone number.");return}
 if(!email.includes("@")){alert("Please enter a valid email address.");return}
 document.getElementById("dataSection").innerHTML="<p>Initializing secure payment...</p>";
 try{
  const r=await fetch(API_BASE+"/api/payment/initialize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,amount,network,plan,productCode,phone})});
  const d=await r.json();
  if(!r.ok||!d.status)throw new Error(d.message||"Payment initialization failed.");
  location.href=d.authorization_url;
 }catch(e){
  document.getElementById("dataSection").innerHTML=`<p class="error">${e.message}</p><button onclick="showData()">Try Again</button>`;
 }
};

window.showAirtime=function(){document.getElementById("dataSection").innerHTML="<h2>Buy Airtime</h2><p>Airtime integration comes next.</p><button onclick='showData()'>Back</button>"};
window.showBills=function(){document.getElementById("dataSection").innerHTML="<h2>Pay Bills</h2><p>Bills integration comes next.</p><button onclick='showData()'>Back</button>"};
console.log("My Data App frontend is working!");
