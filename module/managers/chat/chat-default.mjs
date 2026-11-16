/**
 * SBE — Habillage PAR DÉFAUT des messages de chat (« métal / rouille »).
 *
 * C'est ce que reçoit un monde neuf, et ce que rend « Réinitialiser »
 * dans le manager des messages. Même format qu'un export du manager
 * (partie « chat ») : pour le changer, exporter un réglage et coller
 * son contenu ici.
 */

export const CHAT_DEFAULT = {
  "schemaVersion": 2,
  "frame": {
    "free": true,
    "bg": {
      "dark": "#25272b",
      "light": "#bdc1c6"
    },
    "text": {
      "dark": "#e7e4dd",
      "light": "#1e2024"
    },
    "borderColor": {
      "dark": "#3b3f45",
      "light": "#8c9197"
    },
    "borderWidth": 1,
    "radius": 3,
    "padding": 0,
    "font": "",
    "size": 0,
    "shadow": "soft",
    "bgPath": "",
    "bgCode": "",
    "nameColor": {
      "dark": "#e7e4dd",
      "light": "#1e2024"
    },
    "nameFont": "",
    "portrait": true,
    "portraitSize": 32
  },
  "card": {
    "bg": {
      "dark": "#2c2f34",
      "light": "#aeb3b9"
    },
    "text": {
      "dark": "#e7e4dd",
      "light": "#1e2024"
    },
    "borderColor": {
      "dark": "#3b3f45",
      "light": "#8c9197"
    },
    "borderWidth": 1,
    "radius": 8,
    "accent": {
      "dark": "#b5471f",
      "light": "#b5471f"
    },
    "titleColor": {
      "dark": "#e7e4dd",
      "light": "#1e2024"
    },
    "titleFont": "",
    "titleSize": 0,
    "iconSize": 32
  },
  "outcomes": {
    "success": {
      "label": "",
      "color": {
        "dark": "#2d9d3a",
        "light": "#2d9d3a"
      },
      "text": {
        "dark": "#ffffff",
        "light": "#ffffff"
      },
      "icon": "",
      "sound": {
        "sound": "",
        "volume": 80
      }
    },
    "failure": {
      "label": "",
      "color": {
        "dark": "#c22525",
        "light": "#c22525"
      },
      "text": {
        "dark": "#ffffff",
        "light": "#ffffff"
      },
      "icon": "",
      "sound": {
        "sound": "",
        "volume": 80
      }
    },
    "critSuccess": {
      "label": "",
      "color": {
        "dark": "#2d9d3a",
        "light": "#2d9d3a"
      },
      "text": {
        "dark": "#ffffff",
        "light": "#ffffff"
      },
      "icon": "",
      "sound": {
        "sound": "",
        "volume": 80
      }
    },
    "critFailure": {
      "label": "",
      "color": {
        "dark": "#7a0e0e",
        "light": "#7a0e0e"
      },
      "text": {
        "dark": "#ffffff",
        "light": "#ffffff"
      },
      "icon": "",
      "sound": {
        "sound": "",
        "volume": 80
      }
    }
  },
  "rolls": {
    "mods": {
      "label": "",
      "style": "pill",
      "up": {
        "dark": "",
        "light": ""
      },
      "down": {
        "dark": "",
        "light": ""
      },
      "bg": {
        "dark": "",
        "light": ""
      },
      "icons": true,
      "summary": true
    },
    "adv": {
      "advLabel": "",
      "disLabel": "",
      "advIcon": "fa-solid fa-angles-up",
      "disIcon": "fa-solid fa-angles-down",
      "advColor": {
        "dark": "",
        "light": ""
      },
      "disColor": {
        "dark": "",
        "light": ""
      },
      "text": {
        "dark": "",
        "light": "#ffffff"
      },
      "dropped": true,
      "droppedLabel": ""
    },
    "button": {
      "label": "",
      "icon": "fa-solid fa-dice-d20",
      "bg": {
        "dark": "",
        "light": ""
      },
      "text": {
        "dark": "",
        "light": ""
      },
      "border": {
        "dark": "",
        "light": ""
      },
      "hoverBg": {
        "dark": "",
        "light": ""
      },
      "hoverText": {
        "dark": "",
        "light": ""
      },
      "radius": 4,
      "size": 0,
      "full": false
    }
  },
  "types": {
    "roll": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "columns",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "request": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "item": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "effect": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "& .sbe-card-val { font-style: italic; color: var(--rouille); opacity: 1; }",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "newday": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "alarm": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    },
    "trade": {
      "accent": {
        "dark": "",
        "light": ""
      },
      "icon": "",
      "css": "",
      "layout": "stack",
      "attacker": "left",
      "portrait": true,
      "portraitSize": 36
    }
  },
  "vars": [
    {
      "name": "texte",
      "dark": "#e7e4dd",
      "light": "#1e2024"
    },
    {
      "name": "texte_pale",
      "dark": "#9c988f",
      "light": "#565a60"
    },
    {
      "name": "bord",
      "dark": "#3b3f45",
      "light": "#8c9197"
    },
    {
      "name": "fond_champ",
      "dark": "#141519",
      "light": "#e9ebee"
    },
    {
      "name": "entete_haut",
      "dark": "#2a2d32",
      "light": "#c5c9ce"
    },
    {
      "name": "entete_bas",
      "dark": "#1f2125",
      "light": "#b3b8be"
    },
    {
      "name": "rouille",
      "dark": "#b5471f",
      "light": "#b5471f"
    },
    {
      "name": "chuchote",
      "dark": "#5b7fa6",
      "light": "#5b7fa6"
    },
    {
      "name": "total_fond",
      "dark": "rgba(255, 255, 255, 0.05)",
      "light": "rgba(0, 0, 0, 0.05)"
    }
  ],
  "customCss": "/* ===== Style par défaut « métal / rouille » =====\n   Toutes les couleurs viennent des « Couleurs libres » (var(--nom)) :\n   elles basculent seules entre le thème sombre et le thème clair. */\n\n/* En-tête du message : nom, heure, séparateur. */\n@message { margin: 6px 4px; padding: 8px 10px !important; }\n@message .message-header {\n  color: var(--texte_pale) !important;\n  border-bottom: 1px solid var(--bord);\n  padding-bottom: 4px;\n  margin-bottom: 4px;\n}\n@message .message-sender { font-weight: 700; }\n@message :is(.message-metadata, .message-timestamp, .message-delete, .flavor-text) { color: var(--texte_pale) !important; }\n@message .message-content { color: var(--texte) !important; }\n\n/* Jets de dés de Foundry (chat libre, /r) lisibles sur le métal. */\n@message .dice-roll :is(.dice-formula, .dice-tooltip, .part-formula, .dice-total) {\n  background: var(--fond_champ) !important;\n  color: var(--texte) !important;\n  border: 1px solid var(--bord) !important;\n}\n@message .dice-total { font-weight: 700; }\n\n/* Messages chuchotés : liseré bleu acier. */\n@message.whisper { border-left: 3px solid var(--chuchote) !important; }\n\n/* Messages du système : identité « carte système » (accent rouille). */\n@message.sbe-msg--card {\n  border-left: 3px solid var(--rouille) !important;\n  border-top: 2px solid var(--rouille) !important;\n}\n@message.sbe-msg--card .message-header {\n  background: linear-gradient(180deg, var(--entete_haut) 0%, var(--entete_bas) 100%);\n  border-bottom: 1px solid var(--rouille);\n  margin: -8px -10px 6px -10px;\n  padding: 6px 10px;\n}\n@message.sbe-msg--card .message-sender { text-transform: uppercase; letter-spacing: 0.05em; }\n\n/* La carte : en-tête dégradé, corps aéré, bandeau appuyé. */\n@carte { overflow: hidden; gap: 0; }\n@carte .sbe-card-head {\n  background: linear-gradient(180deg, var(--entete_haut) 0%, var(--entete_bas) 100%);\n  border-bottom: 1px solid var(--bord);\n  padding: 6px 8px;\n}\n@carte .sbe-card-icon .sbe-label-icon-img { border-radius: 5px; object-fit: contain; }\n@carte .sbe-card-title { font-size: 1.15em; }\n@carte .sbe-card-body { padding: 7px 8px; gap: 5px; }\n\n/* Ligne de jet : fond de champ, total encadré, flèche rouille. */\n@carte .sbe-card-dice { background: var(--fond_champ); border-radius: 6px; }\n@carte .sbe-card-dice-caret { color: var(--rouille); opacity: 1; }\n@carte .sbe-card-dice-total { border-color: var(--bord); background: var(--total_fond); }\n@carte .sbe-card-dice-detail .dice-tooltip :is(.part-formula, .part-total, .dice-rolls) { color: var(--texte); }\n\n@carte .sbe-card-result {\n  margin: 0 8px 7px;\n  padding: 6px 8px;\n  border-radius: 5px;\n  font-weight: 800;\n  font-size: 1.1em;\n  letter-spacing: 0.03em;\n  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);\n}\n"
};
