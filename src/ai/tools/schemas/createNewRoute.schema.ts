import { Type } from "@google/genai";

export const CreateNewRouteSchema = {
  name: "create_new_route",
  description: "Creates a new route along with a placeholder element.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      parent_route: {
        type: Type.STRING,
        description:
          "The parent route",
      },
      route_name: {
        type: Type.STRING,
        description: "The name of the route.",
      },
    },
    required: ["parent_route", "route_name"],
  },
};
