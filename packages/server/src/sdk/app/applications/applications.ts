import { AppStatus } from "../../../db/utils"
import { App, ContextUser } from "@budibase/types"
import { getLocksById } from "../../../utilities/redis"
import { enrichApps } from "../../users/sessions"
import { checkAppMetadata } from "../../../automations/logging"
import { db as dbCore, users } from "@budibase/backend-core"

export function filterAppList(user: ContextUser, apps: App[]) {
  let appList: string[] = []
  if (users.hasAppBuilderPermissions(user)) {
    appList = user.builder?.apps!
  } else if (!users.isAdminOrBuilder(user)) {
    appList = Object.keys(user.roles || {})
  } else {
    return apps
  }
  const finalApps: App[] = []
  for (let app of apps) {
    if (appList.includes(dbCore.getProdAppID(app.appId))) {
      finalApps.push(app)
    }
  }
  return finalApps
}

export async function fetch(status: AppStatus, user: ContextUser) {
  const dev = status === AppStatus.DEV
  const all = status === AppStatus.ALL
  let apps = (await dbCore.getAllApps({ dev, all })) as App[]
  apps = filterAppList(user, apps)

  const appIds = apps
    .filter((app: any) => app.status === "development")
    .map((app: any) => app.appId)

  // get the locks for all the dev apps
  if (dev || all) {
    const locks = await getLocksById(appIds)
    for (let app of apps) {
      const lock = locks[app.appId]
      if (lock) {
        app.lockedBy = lock
      } else {
        // make sure its definitely not present
        delete app.lockedBy
      }
    }
  }

  // Enrich apps with all builder user sessions
  const enrichedApps = await enrichApps(apps)

  return await checkAppMetadata(enrichedApps)
}
