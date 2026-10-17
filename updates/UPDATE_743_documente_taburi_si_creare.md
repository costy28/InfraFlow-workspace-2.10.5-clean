# UPDATE 743 — Documente: taburi și creare după drepturi

Versiune: **2.12.723**

Interfața separă Inbox/Ale mele/Toate (`documents:view_own`, conform cerinței actuale a API) de Template-uri (`documents:templates`). Contul care administrează numai șabloane nu încarcă Inbox. Crearea și editarea draftului propriu cer `documents:create`; recomandările asistentului nu mai trimit cititorul către administrarea șabloanelor.

Nu schimbă schema, drepturile persistate sau autorizarea API. Auditul celorlalte acțiuni Documente și al secțiunilor Email/WhatsApp rămâne separat; această etapă nu declară auditul integral finalizat.
