"""Convertit les poids Real-ESRGAN (anime 6B) en modèle ONNX, sans exécuter de code du fichier .pth
(dépickleur restreint : seuls les tenseurs sont lus)."""
import sys, zipfile, pickle, collections
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper

src, dst = sys.argv[1], sys.argv[2]
zf = zipfile.ZipFile(src)
root = [n for n in zf.namelist() if n.endswith('data.pkl')][0][:-len('data.pkl')]

class Storage:
    def __init__(self, key, dtype): self.key, self.dtype = key, dtype
def rebuild(storage, offset, size, stride, *a):
    raw = np.frombuffer(zf.read(f'{root}data/{storage.key}'), dtype=storage.dtype)
    n = int(np.prod(size)) if size else 1
    return raw[offset:offset + n].reshape(size).copy()
class FloatStorage: dtype = np.float32
class U(pickle.Unpickler):
    def find_class(self, mod, name):
        if (mod, name) == ('collections', 'OrderedDict'): return collections.OrderedDict
        if (mod, name) == ('torch._utils', '_rebuild_tensor_v2'): return rebuild
        if (mod, name) == ('torch', 'FloatStorage'): return FloatStorage
        raise pickle.UnpicklingError(f'refusé : {mod}.{name}')
    def persistent_load(self, pid):
        return Storage(pid[2], pid[1].dtype)
sd = U(zf.open(f'{root}data.pkl')).load()
sd = sd.get('params_ema', sd.get('params', sd))
nb = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
print('tenseurs', len(sd), 'blocs', nb, sd['conv_first.weight'].shape)

nodes, inits = [], []
cnt = [0]
def nm(p='t'): cnt[0] += 1; return f'{p}{cnt[0]}'
def const(arr, name=None):
    name = name or nm('c'); inits.append(numpy_helper.from_array(np.asarray(arr), name)); return name
def conv(x, key):
    w, b = const(sd[key + '.weight'], key + '.w'), const(sd[key + '.bias'], key + '.b')
    o = nm(); nodes.append(helper.make_node('Conv', [x, w, b], [o], kernel_shape=[3, 3], pads=[1, 1, 1, 1])); return o
def lrelu(x):
    o = nm(); nodes.append(helper.make_node('LeakyRelu', [x], [o], alpha=0.2)); return o
def cat(xs):
    o = nm(); nodes.append(helper.make_node('Concat', xs, [o], axis=1)); return o
def add(a, b):
    o = nm(); nodes.append(helper.make_node('Add', [a, b], [o])); return o
S02 = const(np.array(0.2, dtype=np.float32), 's02')
def mul02(x):
    o = nm(); nodes.append(helper.make_node('Mul', [x, S02], [o])); return o
SC = const(np.array([1, 1, 2, 2], dtype=np.float32), 'scales')
def up2(x):
    o = nm(); nodes.append(helper.make_node('Resize', [x, '', SC], [o], mode='nearest')); return o
def rdb(x, p):
    x1 = lrelu(conv(x, p + '.conv1'))
    x2 = lrelu(conv(cat([x, x1]), p + '.conv2'))
    x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3'))
    x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4'))
    x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5')
    return add(mul02(x5), x)
def rrdb(x, p):
    o = rdb(rdb(rdb(x, p + '.rdb1'), p + '.rdb2'), p + '.rdb3')
    return add(mul02(o), x)

feat = conv('input', 'conv_first')
b = feat
for i in range(nb): b = rrdb(b, f'body.{i}')
feat = add(feat, conv(b, 'conv_body'))
feat = lrelu(conv(up2(feat), 'conv_up1'))
feat = lrelu(conv(up2(feat), 'conv_up2'))
out = conv(lrelu(conv(feat, 'conv_hr')), 'conv_last')
nodes.append(helper.make_node('Identity', [out], ['output']))
g = helper.make_graph(nodes, 'realesrgan_anime6b',
    [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 'h', 'w'])],
    [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, 'H', 'W'])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8
onnx.checker.check_model(m); onnx.save(m, dst); print('ok', dst)
