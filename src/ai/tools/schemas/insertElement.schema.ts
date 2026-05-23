import { Type } from "@google/genai";

export const ELEMENT_TYPES = [
  "fragment",
  "div",
  "text",
  "image",
  "button",
  "input",
  "textarea",
  "link",
  "icon",
] as const;

const OnClickActionSchema = {
  type: Type.OBJECT,
  properties: {
    kind: {
      type: Type.STRING,
      enum: ["route", "back", "reload", "external"],
      description:
        "What happens when the element is clicked. 'route' navigates within the app, 'external' opens a URL, 'back' goes back, 'reload' refreshes.",
    },
    href: {
      type: Type.STRING,
      description:
        "URL to navigate to (used for kind='route' and kind='external').",
    },
    replace: {
      type: Type.BOOLEAN,
      description: "For kind='route': replace history instead of pushing.",
    },
    newTab: {
      type: Type.BOOLEAN,
      description: "For kind='external': open link in a new tab.",
    },
  },
  required: ["kind"],
};

const BuilderElementPropsSchema = {
  type: Type.OBJECT,
  properties: {
    onClick: OnClickActionSchema,
    text: {
      type: Type.STRING,
      description:
        "Text content used by 'text' (<p>), 'button' (label), and as a fallback for 'link' when it has no children.",
    },
    href: {
      type: Type.STRING,
      description: "For 'link': the href attribute (defaults to '#').",
    },
    placeholder: {
      type: Type.STRING,
      description: "For 'input' and 'textarea': placeholder shown when empty.",
    },
    alt: {
      type: Type.STRING,
      description:
        "For 'image': alt text for accessibility AND the query used to fetch a suitable Unsplash image (src is auto-resolved from alt).",
    },
    target: {
      type: Type.STRING,
      description: "For 'link': target attribute (e.g. '_blank').",
    },
    rel: {
      type: Type.STRING,
      description: "For 'link': rel attribute (e.g. 'noreferrer').",
    },
    value: {
      type: Type.STRING,
      description:
        "For 'input' and 'textarea': default value (maps to defaultValue).",
    },
    type: {
      type: Type.STRING,
      description:
        "For 'input': input type (e.g. 'text', 'email', 'password'). Defaults to 'text'.",
    },

    // icon
    name: {
      type: Type.STRING,
      description: "For 'icon': Lucide icon name (e.g. 'ArrowRight', 'Menu').",
    },
    size: { type: Type.NUMBER, description: "For 'icon': size in px." },
    color: { type: Type.STRING, description: "For 'icon': stroke color." },
    strokeWidth: {
      type: Type.NUMBER,
      description: "For 'icon': stroke width.",
    },
  },
};

export const InsertElementSchema = {
  name: "insert_element",
  description:
    "Inserts a tree of UI elements represented as a flat array of elements. One or more elements can have parentId set to 'parent' to be the roots (siblings inserted at the same level). Subsequent children point to their parent using temporary ID references (e.g., parentId set to parent's temporary id).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      route: {
        type: Type.STRING,
        // Accept both "/about" and "about" (caller might omit the leading slash).
        pattern:
          "^(?:/(?:[A-Za-z0-9_.[\\\\\]-]+(?:/[A-Za-z0-9_.[\\\\\]-]+)*)?|[A-Za-z0-9_.[\\\\\]-]+(?:/[A-Za-z0-9_.[\\\\\]-]+)*)$",
        description:
          "The route to insert the element at. Use URL paths with forward slashes only. Examples: '/', '/about', '/pricing'. If you forget the leading '/', it will be assumed (e.g. 'about' -> '/about'). Never send Windows-style backslashes (e.g. '\\\\') or filesystem paths like 'app/pricing'. Never send empty string.",
      },
      parent_id: {
        type: Type.STRING,
        description: "The parent ID to insert the element tree under.",
      },
      before_id: {
        type: Type.STRING,
        description:
          "Optional. If provided, inserts the new root elements before the existing child element with this id (within parent_id's children list). If not found, appends at the end.",
      },
      elements: {
        type: Type.ARRAY,
        description:
          "Flat array of elements that form a tree. One or more elements can have parentId set to 'parent' to attach directly under the parent_id as siblings. Subsequent child elements should have parentId matching the temporary id of their parent in this array.",
        items: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "A unique temporary ID for this element (e.g. 'root_sec', 'card_bg', 'btn_cta') to refer to it in parentId.",
            },
            parentId: {
              type: Type.STRING,
              description: "The temporary ID of the parent element in this list, or 'parent' to insert directly under the page's parent_id.",
            },
            type: {
              type: Type.STRING,
              enum: ELEMENT_TYPES,
              description:
                "Element type to render. Use 'text' for <p>, 'image' for <img>, 'link' for <a>, 'icon' for Lucide icon, 'fragment' renders children only",
            },
            className: {
              type: Type.STRING,
              description: "Tailwind CSS className (Tailwind only)",
            },
            visible: {
              type: Type.BOOLEAN,
              description: "Visibility flag",
            },
            props: BuilderElementPropsSchema,
          },
          required: ["id", "parentId", "type"],
        },
      },
    },
    required: ["route", "parent_id", "elements"],
  },
};
