import common from "./common";
import today from "./today";
import gym from "./gym";
import notes from "./notes";
import data from "./data";
import progress from "./progress";
import profile from "./profile";
import premium from "./premium";
import appearance from "./appearance";
import app from "./app";
import share from "./share";
import insight from "./insight";
import type { Dict } from "..";

export default {
  ...common,
  ...today,
  ...gym,
  ...notes,
  ...data,
  ...progress,
  ...profile,
  ...premium,
  ...appearance,
  ...app,
  ...share,
  ...insight,
} satisfies Dict;
