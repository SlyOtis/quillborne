import { ConeGeometry, Group, Mesh, SphereGeometry, type Material } from 'three'

/** The lobby look's pin, in metres: a ball over a cone pointing down, floating clear of the floor. */
const BALL = { radius: 0.35, centre: 1.345 }
const CONE = { radius: 0.216, height: 0.702, centre: 0.805 }

/** "You are here": a pin standing over the floor point the group is placed at. */
export function createPin(material: Material): Group {
  const pin = new Group()
  pin.name = 'you are here'
  const ball = new Mesh(new SphereGeometry(BALL.radius, 20, 16), material)
  ball.position.y = BALL.centre
  const cone = new Mesh(new ConeGeometry(CONE.radius, CONE.height, 16), material)
  cone.rotation.x = Math.PI
  cone.position.y = CONE.centre
  for (const m of [ball, cone]) m.castShadow = true
  pin.add(ball, cone)
  return pin
}
