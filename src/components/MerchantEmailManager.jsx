import React, { useState } from "react";
import { X, Mail, Star, Trash2, Plus, Save } from "lucide-react";

function validateEmail(email) {
  return typeof email === 'string' && email.includes('@') && email.includes('.');
}

export default function MerchantEmailManager({ merchant, onSave, onClose }) {
  const [emails, setEmails] = useState(merchant.emails || []);
  const [newEmail, setNewEmail] = useState("");

  const handleAdd = () => {
    const trimmed = newEmail.trim();
    if (!validateEmail(trimmed)) {
      alert("Please enter a valid email address.");
      return;
    }
    if (emails.find(e => e.address.toLowerCase() === trimmed.toLowerCase())) {
      alert("This email is already in the list.");
      return;
    }

    const nextEmails = [...emails, { address: trimmed, isPrimary: emails.length === 0 }];
    setEmails(nextEmails);
    setNewEmail("");
  };

  const handleRemove = (index) => {
    let nextEmails = [...emails];
    const removed = nextEmails.splice(index, 1)[0];
    
    // If we removed the primary, assign primary to the first available
    if (removed.isPrimary && nextEmails.length > 0) {
      nextEmails[0].isPrimary = true;
    }
    
    setEmails(nextEmails);
  };

  const handleMakePrimary = (index) => {
    const nextEmails = emails.map((e, i) => ({
      ...e,
      isPrimary: i === index
    }));
    setEmails(nextEmails);
  };

  const handleSave = () => {
    if (emails.length === 0) {
      alert("A merchant must have at least one email address.");
      return;
    }
    onSave(emails);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
              <Mail className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Edit Contacts</h2>
              <p className="text-sm text-slate-500 font-medium">Manage emails for <span className="font-semibold text-slate-700">{merchant.merchantName}</span></p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
           <div className="flex items-center gap-2 mb-6">
              <div className="flex relative items-center w-full bg-white border border-slate-300 rounded-xl px-4 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                 <input 
                   type="email"
                   value={newEmail}
                   onChange={e => setNewEmail(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleAdd()}
                   placeholder="Add a new email address..."
                   className="w-full bg-transparent outline-none text-sm font-medium text-slate-700"
                 />
              </div>
              <button 
                onClick={handleAdd}
                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
           </div>

           <div className="space-y-3 max-h-64 overflow-y-auto">
             {emails.length === 0 && (
               <div className="text-center py-6 text-sm font-bold text-red-500 bg-red-50 rounded-xl border border-red-100">
                 No emails configured. You must add at least one to save.
               </div>
             )}
             
             {emails.map((email, idx) => (
                <div key={email.address} className={`flex items-center justify-between p-3 rounded-xl border ${email.isPrimary ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
                   <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${email.isPrimary ? "bg-red-100" : "bg-slate-100"}`}>
                         {email.isPrimary ? <Star className="w-4 h-4 text-dd-red fill-dd-red" /> : <Mail className="w-4 h-4 text-slate-400" />}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{email.address}</span>
                        {email.isPrimary ? (
                           <div className="text-[10px] font-bold uppercase tracking-wider text-dd-red mt-0.5">Primary Target</div>
                        ) : (
                           <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Secondary</div>
                        )}
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-2">
                     {!email.isPrimary && (
                        <button 
                          onClick={() => handleMakePrimary(idx)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                        >
                          Make Primary
                        </button>
                     )}
                     <button 
                       onClick={() => handleRemove(idx)}
                       className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                </div>
             ))}
           </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-dd-red hover:bg-dd-red-dark shadow-md transition-colors"
          >
            <Save className="w-4 h-4" /> Save Emails
          </button>
        </div>

      </div>
    </div>
  );
}
