// The landmarks of a face seen from the front, found by the computer's own
// Vision framework (macOS): the outline of the lips (outer and inner), the
// face's contour, the nose. A first reading for scripts/mirror-register.py,
// which checks it against the lips' colour and lets a hand correct it.
//
//   swift scripts/mirror-landmarks.swift <image> [x y w h]
//
// The optional box (pixels from the top left) says where the face is, for a
// picture cut so close that the face is not found on its own. Prints JSON:
// { "<region>": [[x, y], ...] } in pixels from the top left.
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2, let img = NSImage(contentsOfFile: args[1]), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("usage: swift mirror-landmarks.swift <image> [x y w h]\n".data(using: .utf8)!)
  exit(2)
}
let W = Double(cg.width), H = Double(cg.height)
let req = VNDetectFaceLandmarksRequest()
req.constellation = .constellation76Points
if args.count >= 6, let x = Double(args[2]), let y = Double(args[3]), let w = Double(args[4]), let h = Double(args[5]) {
  // (Vision's boxes are normalised, from the bottom left)
  let box = CGRect(x: x / W, y: 1 - (y + h) / H, width: w / W, height: h / H)
  req.inputFaceObservations = [VNFaceObservation(boundingBox: box)]
}
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([req])
guard let face = req.results?.first, let lm = face.landmarks else { print("{}"); exit(0) }
var out: [String: [[Double]]] = [:]
let regions: [(String, VNFaceLandmarkRegion2D?)] = [("outerLips", lm.outerLips), ("innerLips", lm.innerLips), ("faceContour", lm.faceContour), ("nose", lm.nose), ("noseCrest", lm.noseCrest), ("medianLine", lm.medianLine), ("leftEye", lm.leftEye), ("rightEye", lm.rightEye)]
for (name, r) in regions {
  guard let r = r else { continue }
  let pts = r.pointsInImage(imageSize: CGSize(width: W, height: H))
  out[name] = pts.map { [Double($0.x), H - Double($0.y)] }
}
let bb = face.boundingBox
out["box"] = [[bb.minX * W, (1 - bb.maxY) * H], [bb.width * W, bb.height * H]]
let data = try JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: data, encoding: .utf8)!)
