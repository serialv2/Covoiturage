import { supabase } from "./supabase.js";
import { $, toast } from "./utils.js";

export async function register(event) {
  event.preventDefault();

  const fullName = $("#registerName").value.trim();

  const { data, error } = await supabase.auth.signUp({
    email: $("#registerEmail").value.trim(),
    password: $("#registerPassword").value,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(
    data.session
      ? "Compte créé. Il doit maintenant être validé."
      : "Compte créé."
  );
}

export async function login(event) {
  event.preventDefault();

  const { error } = await supabase.auth.signInWithPassword({
    email: $("#loginEmail").value.trim(),
    password: $("#loginPassword").value
  });

  if (error) {
    toast(error.message, "error");
  }
}

export async function logout() {
  await supabase.auth.signOut();
}
